import { stat } from 'node:fs/promises'
import type { Readable } from 'node:stream'
import { crc32 } from 'node:zlib'
import yauzl, { type Entry, type ZipFile } from 'yauzl'
import { normalizeInventoryPath } from './file-inventory'

export interface ZipSecurityPolicy {
  maxArchiveBytes: number
  maxEntries: number
  maxEntryUncompressedBytes: number
  maxTotalUncompressedBytes: number
  maxCompressionRatio: number
  maxPathDepth: number
}

export const PRODUCTION_ZIP_SECURITY_POLICY: Readonly<ZipSecurityPolicy> = Object.freeze({
  maxArchiveBytes: 500 * 1024 * 1024,
  maxEntries: 10_000,
  maxEntryUncompressedBytes: 10 * 1024 * 1024,
  maxTotalUncompressedBytes: 2 * 1024 * 1024 * 1024,
  maxCompressionRatio: 100,
  maxPathDepth: 20,
})

export type ZipSecurityErrorCode =
  | 'ZIP_INVALID'
  | 'ZIP_CRC_MISMATCH'
  | 'ZIP_ARCHIVE_TOO_LARGE'
  | 'ZIP_TOO_MANY_ENTRIES'
  | 'ZIP_ENTRY_TOO_LARGE'
  | 'ZIP_EXPANDED_CONTENT_TOO_LARGE'
  | 'ZIP_COMPRESSION_RATIO_EXCEEDED'
  | 'ZIP_PATH_UNSAFE'
  | 'ZIP_ENCRYPTED'
  | 'ZIP_SYMBOLIC_LINK'

export class ZipSecurityError extends Error {
  constructor(
    readonly code: ZipSecurityErrorCode,
    message: string,
    readonly entryName?: string,
  ) {
    super(message)
    this.name = 'ZipSecurityError'
  }
}

export interface InspectedZipEntry {
  relativePath: string
  directory: boolean
  compressedBytes: number
  uncompressedBytes: number
  compressionRatio: number
}

export type RejectedZipEntryCode =
  | 'ZIP_CRC_MISMATCH'
  | 'ZIP_ENTRY_TOO_LARGE'
  | 'ZIP_COMPRESSION_RATIO_EXCEEDED'
  | 'ZIP_PATH_UNSAFE'
  | 'ZIP_ENCRYPTED'
  | 'ZIP_SYMBOLIC_LINK'

export interface RejectedZipEntry {
  entryName: string
  code: RejectedZipEntryCode
  message: string
}

export interface ZipInspectionResult {
  archiveName: string
  archiveBytes: number
  totalEntries: number
  totalUncompressedBytes: number
  acceptedUncompressedBytes: number
  entries: readonly InspectedZipEntry[]
  rejectedEntries: readonly RejectedZipEntry[]
}

export interface SafeZipEntry {
  relativePath: string
  contents: Buffer
}

export type SafeZipEntryVisitor = (entry: SafeZipEntry) => void | Promise<void>

function assertPositivePolicy(policy: ZipSecurityPolicy): void {
  const integerLimits = {
    maxArchiveBytes: policy.maxArchiveBytes,
    maxEntries: policy.maxEntries,
    maxEntryUncompressedBytes: policy.maxEntryUncompressedBytes,
    maxTotalUncompressedBytes: policy.maxTotalUncompressedBytes,
    maxPathDepth: policy.maxPathDepth,
  }
  for (const [name, value] of Object.entries(integerLimits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError(`Limite ZIP inválido em ${name}: ${value}.`)
    }
  }
  if (!Number.isFinite(policy.maxCompressionRatio) || policy.maxCompressionRatio <= 0) {
    throw new TypeError(
      `Limite ZIP inválido em maxCompressionRatio: ${policy.maxCompressionRatio}.`,
    )
  }
}

function openFile(path: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      path,
      {
        autoClose: false,
        lazyEntries: true,
        decodeStrings: false,
        validateEntrySizes: true,
        strictFileNames: true,
      },
      (error, zipFile) => (error || !zipFile ? reject(error) : resolve(zipFile)),
    )
  })
}

function openBuffer(buffer: Buffer): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      buffer,
      {
        lazyEntries: true,
        decodeStrings: false,
        validateEntrySizes: true,
        strictFileNames: true,
      },
      (error, zipFile) => (error || !zipFile ? reject(error) : resolve(zipFile)),
    )
  })
}

function nextEntry(zipFile: ZipFile): Promise<Entry | undefined> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      zipFile.off('entry', onEntry)
      zipFile.off('end', onEnd)
      zipFile.off('error', onError)
    }
    const onEntry = (entry: Entry): void => {
      cleanup()
      resolve(entry)
    }
    const onEnd = (): void => {
      cleanup()
      resolve(undefined)
    }
    const onError = (error: Error): void => {
      cleanup()
      reject(error)
    }

    zipFile.once('entry', onEntry)
    zipFile.once('end', onEnd)
    zipFile.once('error', onError)
    zipFile.readEntry()
  })
}

function openEntry(zipFile: ZipFile, entry: Entry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) =>
      error || !stream ? reject(error) : resolve(stream as Readable),
    )
  })
}

function isSymbolicLink(entry: Entry): boolean {
  const creatorSystem = entry.versionMadeBy >>> 8
  const unixMode = entry.externalFileAttributes >>> 16
  return creatorSystem === 3 && (unixMode & 0o170000) === 0o120000
}

function entryFileName(entry: Entry): string {
  const rawName: unknown = entry.fileName
  if (!Buffer.isBuffer(rawName)) return entry.fileName
  return rawName.toString((entry.generalPurposeBitFlag & 0x800) !== 0 ? 'utf8' : 'latin1')
}

function compressionRatio(entry: Entry): number {
  if (entry.uncompressedSize === 0) return 1
  if (entry.compressedSize === 0) return Number.POSITIVE_INFINITY
  return entry.uncompressedSize / entry.compressedSize
}

async function verifyEntryContents(
  zipFile: ZipFile,
  entry: Entry,
  policy: ZipSecurityPolicy,
  currentTotal: number,
  captureContents: boolean,
): Promise<{ bytes: number; contents?: Buffer }> {
  const fileName = entryFileName(entry)
  const stream = await openEntry(zipFile, entry)
  let actualEntryBytes = 0
  let actualCrc32 = 0
  const chunks: Buffer[] = []

  for await (const data of stream) {
    const chunk = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data)
    const bytes = chunk.byteLength
    actualEntryBytes += bytes
    if (captureContents) chunks.push(chunk)
    actualCrc32 = crc32(chunk, actualCrc32)
    if (actualEntryBytes > policy.maxEntryUncompressedBytes) {
      stream.destroy()
      throw new ZipSecurityError(
        'ZIP_ENTRY_TOO_LARGE',
        `Entrada ZIP excede o limite descomprimido: ${fileName}.`,
        fileName,
      )
    }
    if (currentTotal + actualEntryBytes > policy.maxTotalUncompressedBytes) {
      stream.destroy()
      throw new ZipSecurityError(
        'ZIP_EXPANDED_CONTENT_TOO_LARGE',
        'Conteúdo total descomprimido excede o limite do lote.',
        fileName,
      )
    }
  }

  if (actualCrc32 !== entry.crc32) {
    throw new ZipSecurityError(
      'ZIP_CRC_MISMATCH',
      `CRC-32 divergente na entrada: ${fileName}.`,
      fileName,
    )
  }

  return {
    bytes: actualEntryBytes,
    ...(captureContents ? { contents: Buffer.concat(chunks) } : {}),
  }
}

async function inspectOpenedZip(
  zipFile: ZipFile,
  archiveName: string,
  archiveBytes: number,
  policy: ZipSecurityPolicy,
  visitor?: SafeZipEntryVisitor,
): Promise<ZipInspectionResult> {
  const entries: InspectedZipEntry[] = []
  const rejectedEntries: RejectedZipEntry[] = []
  let totalEntries = 0
  let totalUncompressedBytes = 0
  let acceptedUncompressedBytes = 0

  const rejectEntry = (
    entryName: string,
    code: RejectedZipEntryCode,
    message: string,
  ): void => {
    rejectedEntries.push({ entryName, code, message })
  }

  try {
    while (true) {
      const entry = await nextEntry(zipFile)
      if (!entry) break
      totalEntries += 1

      if (totalEntries > policy.maxEntries) {
        throw new ZipSecurityError(
          'ZIP_TOO_MANY_ENTRIES',
          `ZIP excede o limite de ${policy.maxEntries} entradas.`,
        )
      }
      const fileName = entryFileName(entry)
      totalUncompressedBytes += entry.uncompressedSize
      if (totalUncompressedBytes > policy.maxTotalUncompressedBytes) {
        throw new ZipSecurityError(
          'ZIP_EXPANDED_CONTENT_TOO_LARGE',
          'Conteúdo total descomprimido excede o limite do lote.',
          fileName,
        )
      }
      if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
        rejectEntry(
          fileName,
          'ZIP_ENCRYPTED',
          `Entrada ZIP criptografada não é aceita: ${fileName}.`,
        )
        continue
      }
      if (isSymbolicLink(entry)) {
        rejectEntry(
          fileName,
          'ZIP_SYMBOLIC_LINK',
          `Link simbólico não é aceito no ZIP: ${fileName}.`,
        )
        continue
      }

      let relativePath: string
      try {
        relativePath = normalizeInventoryPath(fileName)
      } catch {
        rejectEntry(
          fileName,
          'ZIP_PATH_UNSAFE',
          `Caminho inseguro no ZIP: ${fileName}.`,
        )
        continue
      }
      if (relativePath.split('/').length > policy.maxPathDepth) {
        rejectEntry(
          fileName,
          'ZIP_PATH_UNSAFE',
          `Caminho excede a profundidade permitida no ZIP: ${fileName}.`,
        )
        continue
      }

      const directory = fileName.endsWith('/')
      const ratio = compressionRatio(entry)
      if (entry.uncompressedSize > policy.maxEntryUncompressedBytes) {
        rejectEntry(
          fileName,
          'ZIP_ENTRY_TOO_LARGE',
          `Entrada ZIP excede o limite descomprimido: ${fileName}.`,
        )
        continue
      }
      if (ratio > policy.maxCompressionRatio) {
        rejectEntry(
          fileName,
          'ZIP_COMPRESSION_RATIO_EXCEEDED',
          `Taxa de compressão excessiva na entrada: ${fileName}.`,
        )
        continue
      }

      let verified: { bytes: number; contents?: Buffer }
      try {
        verified = directory
          ? { bytes: 0 }
          : await verifyEntryContents(
              zipFile,
              entry,
              policy,
              acceptedUncompressedBytes,
              visitor !== undefined,
            )
      } catch (error) {
        if (
          error instanceof ZipSecurityError &&
          (error.code === 'ZIP_CRC_MISMATCH' || error.code === 'ZIP_ENTRY_TOO_LARGE')
        ) {
          rejectEntry(fileName, error.code, error.message)
          continue
        }
        throw error
      }
      const actualBytes = verified.bytes
      acceptedUncompressedBytes += actualBytes
      entries.push({
        relativePath,
        directory,
        compressedBytes: entry.compressedSize,
        uncompressedBytes: actualBytes,
        compressionRatio: ratio,
      })
      if (!directory && visitor && verified.contents) {
        await visitor({ relativePath, contents: verified.contents })
      }
    }

    return {
      archiveName,
      archiveBytes,
      totalEntries,
      totalUncompressedBytes,
      acceptedUncompressedBytes,
      entries,
      rejectedEntries,
    }
  } finally {
    zipFile.close()
  }
}

function wrapInvalidZip(error: unknown): never {
  if (error instanceof ZipSecurityError) throw error
  const message = error instanceof Error ? error.message : String(error)
  if (/invalid relative path|absolute path|invalid characters in fileName/i.test(message)) {
    throw new ZipSecurityError('ZIP_PATH_UNSAFE', `Caminho inseguro no ZIP: ${message}`)
  }
  throw new ZipSecurityError('ZIP_INVALID', `ZIP inválido ou corrompido: ${message}`)
}

export async function inspectZipBuffer(
  buffer: Buffer,
  archiveName: string,
  policy: ZipSecurityPolicy,
): Promise<ZipInspectionResult> {
  assertPositivePolicy(policy)
  if (buffer.byteLength > policy.maxArchiveBytes) {
    throw new ZipSecurityError('ZIP_ARCHIVE_TOO_LARGE', 'ZIP excede o limite de entrada.')
  }

  try {
    return await inspectOpenedZip(
      await openBuffer(buffer),
      archiveName,
      buffer.byteLength,
      policy,
    )
  } catch (error) {
    wrapInvalidZip(error)
  }
}

export async function visitSafeZipBufferEntries(
  buffer: Buffer,
  archiveName: string,
  policy: ZipSecurityPolicy,
  visitor: SafeZipEntryVisitor,
): Promise<ZipInspectionResult> {
  assertPositivePolicy(policy)
  if (buffer.byteLength > policy.maxArchiveBytes) {
    throw new ZipSecurityError('ZIP_ARCHIVE_TOO_LARGE', 'ZIP excede o limite de entrada.')
  }

  try {
    return await inspectOpenedZip(
      await openBuffer(buffer),
      archiveName,
      buffer.byteLength,
      policy,
      visitor,
    )
  } catch (error) {
    wrapInvalidZip(error)
  }
}

export async function inspectZipFile(
  path: string,
  policy: ZipSecurityPolicy,
): Promise<ZipInspectionResult> {
  assertPositivePolicy(policy)
  const metadata = await stat(path)
  if (!metadata.isFile()) throw new ZipSecurityError('ZIP_INVALID', 'A origem não é um arquivo.')
  if (metadata.size > policy.maxArchiveBytes) {
    throw new ZipSecurityError('ZIP_ARCHIVE_TOO_LARGE', 'ZIP excede o limite de entrada.')
  }

  try {
    return await inspectOpenedZip(await openFile(path), path, metadata.size, policy)
  } catch (error) {
    wrapInvalidZip(error)
  }
}

export async function visitSafeZipFileEntries(
  path: string,
  policy: ZipSecurityPolicy,
  visitor: SafeZipEntryVisitor,
): Promise<ZipInspectionResult> {
  assertPositivePolicy(policy)
  const metadata = await stat(path)
  if (!metadata.isFile()) throw new ZipSecurityError('ZIP_INVALID', 'A origem não é um arquivo.')
  if (metadata.size > policy.maxArchiveBytes) {
    throw new ZipSecurityError('ZIP_ARCHIVE_TOO_LARGE', 'ZIP excede o limite de entrada.')
  }

  try {
    return await inspectOpenedZip(await openFile(path), path, metadata.size, policy, visitor)
  } catch (error) {
    wrapInvalidZip(error)
  }
}
