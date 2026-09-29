import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import {
  createBatchProvenance,
  inventoryContents,
  inventoryLocalFiles,
  normalizeInventoryPath,
  type BatchProvenance,
  type InventoryCandidate,
} from '../src'

const batch: BatchProvenance = {
  batchId: '018f4f89-6b72-7a32-a1c4-8d0ca214db11',
  receivedAt: '2026-09-15T15:00:00.000Z',
}

const xmlA = new TextEncoder().encode('<?xml version="1.0"?><NFe id="A"/>')
const xmlB = new TextEncoder().encode('\ufeff  <NFe id="B"/>')

const candidates: readonly InventoryCandidate[] = [
  { relativePath: 'fornecedor-b/nota-2.xml', contents: xmlB, originKind: 'FOLDER_FILE' },
  { relativePath: 'fornecedor-a/nota-1.xml', contents: xmlA, originKind: 'FOLDER_FILE' },
]

describe('inventário de arquivos', () => {
  it('gera o mesmo inventário independentemente da ordem de entrada', () => {
    const direct = inventoryContents(batch, candidates)
    const reversed = inventoryContents(batch, [...candidates].reverse())

    expect(reversed).toEqual(direct)
    expect(direct.occurrences.map((entry) => entry.provenance.relativePath)).toEqual([
      'fornecedor-a/nota-1.xml',
      'fornecedor-b/nota-2.xml',
    ])
    expect(direct.occurrences.map((entry) => entry.order)).toEqual([1, 2])
  })

  it('calcula SHA-256 do conteúdo e detecta o tipo sem confiar na extensão', () => {
    const result = inventoryContents(batch, [
      { relativePath: 'arquivo-sem-extensao', contents: new TextEncoder().encode('abc') },
      { relativePath: 'nota.bin', contents: xmlA },
      { relativePath: 'pacote.xml', contents: Uint8Array.from([0x50, 0x4b, 0x03, 0x04]) },
    ])

    const unknown = result.occurrences.find(
      (entry) => entry.provenance.relativePath === 'arquivo-sem-extensao',
    )
    const xml = result.occurrences.find((entry) => entry.provenance.relativePath === 'nota.bin')
    const zip = result.occurrences.find((entry) => entry.provenance.relativePath === 'pacote.xml')

    expect(unknown).toMatchObject({
      contentHash: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      sizeBytes: 3,
      detectedKind: 'UNKNOWN',
    })
    expect(xml?.detectedKind).toBe('XML')
    expect(zip?.detectedKind).toBe('ZIP')
  })

  it('preserva cada ocorrência repetida sem deduplicar o inventário', () => {
    const result = inventoryContents(batch, [
      { relativePath: 'a/nota.xml', contents: xmlA },
      { relativePath: 'b/nota-copia.xml', contents: xmlA },
    ])

    expect(result.occurrences).toHaveLength(2)
    expect(result.occurrences[0]?.contentHash).toBe(result.occurrences[1]?.contentHash)
    expect(result.occurrences.map((entry) => entry.provenance.relativePath)).toEqual([
      'a/nota.xml',
      'b/nota-copia.xml',
    ])
  })

  it('normaliza separadores e recusa caminhos absolutos ou ascendentes', () => {
    expect(normalizeInventoryPath('.\\pasta\\subpasta\\nota.xml')).toBe(
      'pasta/subpasta/nota.xml',
    )
    expect(() => normalizeInventoryPath('../segredo.xml')).toThrow(/Caminho relativo inválido/)
    expect(() => normalizeInventoryPath('/tmp/nota.xml')).toThrow(/Caminho relativo inválido/)
    expect(() => normalizeInventoryPath('C:\\notas\\nota.xml')).toThrow(
      /Caminho relativo inválido/,
    )
  })

  it('gera identidade de lote separada da identidade do conteúdo', () => {
    const first = createBatchProvenance({
      batchId: 'lote-1',
      receivedAt: '2026-09-15T15:00:00.000Z',
    })
    const second = createBatchProvenance({
      batchId: 'lote-2',
      receivedAt: '2026-09-15T16:00:00.000Z',
    })
    const firstInventory = inventoryContents(first, candidates)
    const secondInventory = inventoryContents(second, candidates)

    expect(firstInventory.inventoryHash).toBe(secondInventory.inventoryHash)
    expect(firstInventory.batch).not.toEqual(secondInventory.batch)
  })

  it('lê arquivos locais em streaming com a mesma representação canônica', async () => {
    const fixturePath = new URL('./fixtures/nfe-proc-minima.xml', import.meta.url)
    const result = await inventoryLocalFiles(batch, [
      { absolutePath: fileURLToPath(fixturePath), relativePath: 'entrada/nota.xml' },
    ])

    expect(result.occurrences[0]).toMatchObject({
      order: 1,
      detectedKind: 'XML',
      provenance: {
        originKind: 'SELECTED_FILE',
        relativePath: 'entrada/nota.xml',
        originalName: 'nota.xml',
      },
    })
    expect(result.occurrences[0]?.contentHash).toMatch(/^[a-f0-9]{64}$/)
  })
})
