import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'

export type InventorySourceKind = 'XML' | 'ZIP' | 'UNKNOWN'
export type InventoryOriginKind = 'SELECTED_FILE' | 'FOLDER_FILE' | 'ZIP_ENTRY'

export interface BatchProvenance {
  batchId: string
  receivedAt: string
}

export interface InventoryCandidate {
  relativePath: string
  contents: Uint8Array
  originKind?: InventoryOriginKind
  containerName?: string
}

export interface LocalInventorySource {
  absolutePath: string
  relativePath?: string
  originKind?: Exclude<InventoryOriginKind, 'ZIP_ENTRY'>
}

export interface FileProvenance {
  originKind: InventoryOriginKind
  relativePath: string
  originalName: string
  containerName?: string
}

export interface FileInventoryOccurrence {
  order: number
  contentHash: string
  sizeBytes: number
  detectedKind: InventorySourceKind
  provenance: FileProvenance
}

export interface FileInventory {
  batch: BatchProvenance
  hashAlgorithm: 'SHA-256'
  inventoryHash: string
  occurrences: readonly FileInventoryOccurrence[]
}

interface InspectedCandidate {
  contentHash: string
  sizeBytes: number
  detectedKind: InventorySourceKind
  provenance: FileProvenance
}

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const

export function createBatchProvenance(
  values: { batchId?: string; receivedAt?: string } = {},
): BatchProvenance {
  return {
    batchId: values.batchId ?? randomUUID(),
    receivedAt: values.receivedAt ?? new Date().toISOString(),
  }
}

export function normalizeInventoryPath(input: string): string {
  const normalized = input.replaceAll('\\', '/').normalize('NFC')
  const segments = normalized.split('/').filter((segment) => segment !== '' && segment !== '.')

  if (
    input.includes('\0') ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    segments.length === 0 ||
    segments.some((segment) => segment === '..')
  ) {
    throw new Error(`Caminho relativo inválido para inventário: ${input}.`)
  }

  return segments.join('/')
}

function detectKind(prefix: Uint8Array): InventorySourceKind {
  if (
    prefix.length >= 4 &&
    prefix[0] === 0x50 &&
    prefix[1] === 0x4b &&
    ((prefix[2] === 0x03 && prefix[3] === 0x04) ||
      (prefix[2] === 0x05 && prefix[3] === 0x06) ||
      (prefix[2] === 0x07 && prefix[3] === 0x08))
  ) {
    return 'ZIP'
  }

  const text = new TextDecoder().decode(prefix)
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  return withoutBom.trimStart().startsWith('<') ? 'XML' : 'UNKNOWN'
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function sortCandidates(
  left: InspectedCandidate,
  right: InspectedCandidate,
): number {
  return (
    compareText(left.provenance.relativePath, right.provenance.relativePath) ||
    compareText(left.contentHash, right.contentHash) ||
    left.sizeBytes - right.sizeBytes ||
    compareText(left.provenance.originKind, right.provenance.originKind) ||
    compareText(left.provenance.containerName ?? '', right.provenance.containerName ?? '')
  )
}

function sha256(contents: Uint8Array | string): string {
  return createHash('sha256').update(contents).digest('hex')
}

function provenance(
  relativePath: string,
  originKind: InventoryOriginKind,
  containerName?: string,
): FileProvenance {
  const path = normalizeInventoryPath(relativePath)
  return {
    originKind,
    relativePath: path,
    originalName: path.slice(path.lastIndexOf('/') + 1),
    ...(containerName ? { containerName } : {}),
  }
}

function finalizeInventory(
  batch: BatchProvenance,
  candidates: readonly InspectedCandidate[],
): FileInventory {
  const sorted = [...candidates].sort(sortCandidates)
  const occurrences = sorted.map<FileInventoryOccurrence>((candidate, index) => ({
    order: index + 1,
    contentHash: candidate.contentHash,
    sizeBytes: candidate.sizeBytes,
    detectedKind: candidate.detectedKind,
    provenance: candidate.provenance,
  }))
  const canonicalInventory = JSON.stringify(
    occurrences.map(({ contentHash, sizeBytes, detectedKind, provenance: source }) =>
      [
        source.relativePath,
        contentHash,
        sizeBytes,
        detectedKind,
        source.originKind,
        source.containerName ?? '',
      ],
    ),
  )

  return {
    batch,
    hashAlgorithm: 'SHA-256',
    inventoryHash: sha256(canonicalInventory),
    occurrences,
  }
}

export function inventoryContents(
  batch: BatchProvenance,
  candidates: readonly InventoryCandidate[],
): FileInventory {
  return finalizeInventory(
    batch,
    candidates.map((candidate) => ({
      contentHash: sha256(candidate.contents),
      sizeBytes: candidate.contents.byteLength,
      detectedKind: detectKind(candidate.contents.subarray(0, 512)),
      provenance: provenance(
        candidate.relativePath,
        candidate.originKind ?? 'SELECTED_FILE',
        candidate.containerName,
      ),
    })),
  )
}

async function inspectLocalFile(source: LocalInventorySource): Promise<InspectedCandidate> {
  const metadata = await stat(source.absolutePath)
  if (!metadata.isFile()) throw new Error(`A origem não é um arquivo: ${source.absolutePath}.`)

  const hash = createHash('sha256')
  const prefix = Buffer.alloc(512)
  let prefixLength = 0
  let sizeBytes = 0

  for await (const data of createReadStream(source.absolutePath)) {
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data)
    hash.update(chunk)
    sizeBytes += chunk.byteLength
    if (prefixLength < prefix.byteLength) {
      prefixLength += chunk.copy(prefix, prefixLength, 0, prefix.byteLength - prefixLength)
    }
  }

  const metadataAfterRead = await stat(source.absolutePath)
  if (
    sizeBytes !== metadata.size ||
    metadataAfterRead.size !== metadata.size ||
    metadataAfterRead.mtimeMs !== metadata.mtimeMs ||
    metadataAfterRead.ino !== metadata.ino
  ) {
    throw new Error(`O arquivo foi alterado durante o inventário: ${source.absolutePath}.`)
  }

  return {
    contentHash: hash.digest('hex'),
    sizeBytes,
    detectedKind: detectKind(prefix.subarray(0, prefixLength)),
    provenance: provenance(
      source.relativePath ?? basename(source.absolutePath),
      source.originKind ?? 'SELECTED_FILE',
    ),
  }
}

export async function inventoryLocalFiles(
  batch: BatchProvenance,
  sources: readonly LocalInventorySource[],
): Promise<FileInventory> {
  const inspected = await Promise.all(sources.map(inspectLocalFile))
  return finalizeInventory(batch, inspected)
}
