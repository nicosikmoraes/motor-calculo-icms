import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import yazl from 'yazl'
import {
  PRODUCTION_XML_SECURITY_POLICY,
  PRODUCTION_ZIP_SECURITY_POLICY,
  XmlSecurityError,
  ZipSecurityError,
  assertSafeXml,
  inspectZipBuffer,
  visitSafeZipBufferEntries,
  type ZipSecurityPolicy,
} from '../src'

const policy: ZipSecurityPolicy = {
  maxArchiveBytes: 1_000_000,
  maxEntries: 10,
  maxEntryUncompressedBytes: 20_000,
  maxTotalUncompressedBytes: 30_000,
  maxCompressionRatio: 100,
  maxPathDepth: 5,
}

async function zip(
  entries: readonly { name: string; contents: Buffer; compress?: boolean; mode?: number }[],
): Promise<Buffer> {
  const archive = new yazl.ZipFile()
  const chunks: Buffer[] = []
  archive.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk))
  const completed = new Promise<Buffer>((resolve, reject) => {
    archive.outputStream.once('error', reject)
    archive.outputStream.once('end', () => resolve(Buffer.concat(chunks)))
  })
  for (const entry of entries) {
    archive.addBuffer(entry.contents, entry.name, {
      compress: entry.compress ?? true,
      mtime: new Date('2026-09-15T00:00:00.000Z'),
      ...(entry.mode === undefined ? {} : { mode: entry.mode }),
    })
  }
  archive.end()
  return completed
}

function replaceAllBytes(buffer: Buffer, from: string, to: string): Buffer {
  if (Buffer.byteLength(from) !== Buffer.byteLength(to)) throw new Error('Tamanhos diferentes.')
  const result = Buffer.from(buffer)
  const source = Buffer.from(from)
  const replacement = Buffer.from(to)
  let offset = 0
  while ((offset = result.indexOf(source, offset)) !== -1) {
    replacement.copy(result, offset)
    offset += replacement.byteLength
  }
  return result
}

function corruptCentralDirectoryCrc(buffer: Buffer): Buffer {
  const result = Buffer.from(buffer)
  const centralHeaderOffset = result.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  if (centralHeaderOffset === -1) throw new Error('Diretório central não encontrado.')
  result.writeUInt32LE(0, centralHeaderOffset + 16)
  return result
}

describe('segurança de XML e ZIP', () => {
  it('recusa entidades externas e DTD antes do parser', () => {
    const xxe = '<!DOCTYPE NFe [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><NFe>&xxe;</NFe>'

    expect(() => assertSafeXml(xxe)).toThrowError(XmlSecurityError)
  })

  it('aplica os limites de produção aprovados', () => {
    expect(PRODUCTION_XML_SECURITY_POLICY).toEqual({
      maxBytes: 10 * 1024 * 1024,
      maxDepth: 100,
    })
    expect(PRODUCTION_ZIP_SECURITY_POLICY).toEqual({
      maxArchiveBytes: 500 * 1024 * 1024,
      maxEntries: 10_000,
      maxEntryUncompressedBytes: 10 * 1024 * 1024,
      maxTotalUncompressedBytes: 2 * 1024 * 1024 * 1024,
      maxCompressionRatio: 100,
      maxPathDepth: 20,
    })
  })

  it('recusa XML acima do tamanho e da profundidade permitidos', () => {
    expect(() => assertSafeXml('<NFe/>', { maxBytes: 5, maxDepth: 100 })).toThrowError(
      expect.objectContaining({ code: 'XML_TOO_LARGE' }),
    )
    expect(() => assertSafeXml('<a><b><c/></b></a>', { maxBytes: 100, maxDepth: 2 })).toThrowError(
      expect.objectContaining({ code: 'XML_DEPTH_EXCEEDED' }),
    )
  })

  it('inspeciona ZIP válido sem escrever entradas no disco', async () => {
    const buffer = await zip([
      { name: 'empresa/nota-1.xml', contents: Buffer.from('<NFe/>') },
      { name: 'empresa/nota-2.xml', contents: Buffer.from('<NFe/>') },
    ])
    const result = await inspectZipBuffer(buffer, 'lote.zip', policy)

    expect(result).toMatchObject({
      archiveName: 'lote.zip',
      totalEntries: 2,
      totalUncompressedBytes: 12,
      acceptedUncompressedBytes: 12,
      rejectedEntries: [],
      entries: [
        { relativePath: 'empresa/nota-1.xml', directory: false, uncompressedBytes: 6 },
        { relativePath: 'empresa/nota-2.xml', directory: false, uncompressedBytes: 6 },
      ],
    })
  })

  it('visita uma entrada segura por vez sem reter o ZIP inteiro', async () => {
    const buffer = await zip([
      { name: 'nota-1.xml', contents: Buffer.from('<NFe id="1"/>') },
      { name: 'nota-2.xml', contents: Buffer.from('<NFe id="2"/>') },
    ])
    const visited: string[] = []

    const result = await visitSafeZipBufferEntries(buffer, 'lote.zip', policy, (entry) => {
      visited.push(`${entry.relativePath}:${entry.contents.toString('utf8')}`)
    })

    expect(visited).toEqual(['nota-1.xml:<NFe id="1"/>', 'nota-2.xml:<NFe id="2"/>'])
    expect(result.entries).toHaveLength(2)
  })

  it('isola Zip Slip e preserva as entradas seguras', async () => {
    const safe = await zip([
      { name: 'safe/evil.xml', contents: Buffer.from('<NFe/>') },
      { name: 'nota-valida.xml', contents: Buffer.from('<NFe/>') },
    ])
    const malicious = replaceAllBytes(safe, 'safe/evil.xml', '../x/evil.xml')

    await expect(inspectZipBuffer(malicious, 'zip-slip.zip', policy)).resolves.toMatchObject({
      totalEntries: 2,
      entries: [{ relativePath: 'nota-valida.xml' }],
      rejectedEntries: [{ entryName: '../x/evil.xml', code: 'ZIP_PATH_UNSAFE' }],
    })
  })

  it('isola entrada com taxa de compressão excessiva', async () => {
    const bomb = await zip([{ name: 'bomba.xml', contents: Buffer.alloc(10_000, 0x41) }])

    await expect(
      inspectZipBuffer(bomb, 'bomba.zip', { ...policy, maxCompressionRatio: 2 }),
    ).resolves.toMatchObject({
      entries: [],
      rejectedEntries: [{ code: 'ZIP_COMPRESSION_RATIO_EXCEEDED' }],
    })
  })

  it('recusa excesso de entradas, tamanho expandido e profundidade', async () => {
    const twoEntries = await zip([
      { name: 'a.xml', contents: Buffer.from('<NFe/>'), compress: false },
      { name: 'b.xml', contents: Buffer.from('<NFe/>'), compress: false },
    ])
    const deep = await zip([{ name: 'a/b/c/d/nota.xml', contents: Buffer.from('<NFe/>') }])

    await expect(
      inspectZipBuffer(twoEntries, 'muitos.zip', { ...policy, maxEntries: 1 }),
    ).rejects.toMatchObject({ code: 'ZIP_TOO_MANY_ENTRIES' })
    await expect(
      inspectZipBuffer(twoEntries, 'grande.zip', { ...policy, maxTotalUncompressedBytes: 10 }),
    ).rejects.toMatchObject({ code: 'ZIP_EXPANDED_CONTENT_TOO_LARGE' })
    await expect(
      inspectZipBuffer(deep, 'profundo.zip', { ...policy, maxPathDepth: 3 }),
    ).resolves.toMatchObject({
      entries: [],
      rejectedEntries: [{ code: 'ZIP_PATH_UNSAFE' }],
    })
  })

  it('recusa arquivo grande, entrada grande e link simbólico', async () => {
    const regular = await zip([
      { name: 'nota.xml', contents: Buffer.from('<NFe>CONTEUDO</NFe>'), compress: false },
    ])
    const symbolicLink = await zip([
      { name: 'atalho.xml', contents: Buffer.from('nota.xml'), mode: 0o120777 },
    ])

    await expect(
      inspectZipBuffer(regular, 'arquivo-grande.zip', { ...policy, maxArchiveBytes: 10 }),
    ).rejects.toMatchObject({ code: 'ZIP_ARCHIVE_TOO_LARGE' })
    await expect(
      inspectZipBuffer(regular, 'entrada-grande.zip', {
        ...policy,
        maxEntryUncompressedBytes: 5,
      }),
    ).resolves.toMatchObject({
      entries: [],
      rejectedEntries: [{ code: 'ZIP_ENTRY_TOO_LARGE' }],
    })
    await expect(
      inspectZipBuffer(symbolicLink, 'link.zip', policy),
    ).resolves.toMatchObject({
      entries: [],
      rejectedEntries: [{ code: 'ZIP_SYMBOLIC_LINK' }],
    })
  })

  it('recusa ZIP truncado ou corrompido com código estável', async () => {
    const valid = await zip([{ name: 'nota.xml', contents: Buffer.from('<NFe/>') }])
    const truncated = valid.subarray(0, Math.floor(valid.length / 2))
    const wrongCrc = corruptCentralDirectoryCrc(valid)

    await expect(inspectZipBuffer(truncated, 'corrompido.zip', policy)).rejects.toEqual(
      expect.objectContaining<Partial<ZipSecurityError>>({ code: 'ZIP_INVALID' }),
    )
    await expect(inspectZipBuffer(wrongCrc, 'crc-incorreto.zip', policy)).resolves.toMatchObject({
      entries: [],
      rejectedEntries: [{ code: 'ZIP_CRC_MISMATCH' }],
    })
  })

  it('não permite desabilitar proteções com limites inválidos', async () => {
    const valid = await zip([{ name: 'nota.xml', contents: Buffer.from('<NFe/>') }])

    await expect(
      inspectZipBuffer(valid, 'sem-limite.zip', { ...policy, maxEntries: Number.POSITIVE_INFINITY }),
    ).rejects.toThrow(TypeError)
    await expect(
      inspectZipBuffer(valid, 'fracionario.zip', { ...policy, maxPathDepth: 1.5 }),
    ).rejects.toThrow(TypeError)
  })
})
