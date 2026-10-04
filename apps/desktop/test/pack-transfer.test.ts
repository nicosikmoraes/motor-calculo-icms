import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createIcmsPack, serializeIcmsPack, PACK_MAX_BYTES } from '@motor/interchange'
import { readPackFile, writePackFile } from '../src/main/pack-file-io'
import { PackPreviewSessions } from '../src/main/pack-preview-session'
const temporary: string[] = []
afterEach(async () => { await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))) })
const json = () => serializeIcmsPack(createIcmsPack({ companies: [], profiles: [], products: [], rules: [] },
  { createdAt: '2026-10-01T23:00:00.000Z', appVersion: 'test' }))
describe('arquivo e autorização da prévia de intercâmbio', () => {
  it('salva e lê pacote válido, substitui destino e remove temporários', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pack-test-')); temporary.push(directory)
    const path = join(directory, 'cadastros.icmspack')
    await writeFile(path, 'Arquivo anterior')
    await writePackFile(path, json())
    expect(await readPackFile(path)).toBe(json())
    expect(await readdir(directory)).toEqual(['cadastros.icmspack'])
  })
  it('pacote inválido não trunca destino; leitura recusa arquivo grande e UTF-8 inválido', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pack-test-')); temporary.push(directory)
    const path = join(directory, 'cadastros.icmspack')
    await writeFile(path, 'Original')
    await expect(writePackFile(path, '{}')).rejects.toThrow()
    expect(await readFile(path, 'utf8')).toBe('Original')
    await writeFile(path, Buffer.alloc(PACK_MAX_BYTES + 1))
    await expect(readPackFile(path)).rejects.toThrow(/10 MiB/)
    await writeFile(path, Buffer.from([0xff]))
    await expect(readPackFile(path)).rejects.toThrow()
    await expect(readPackFile(directory)).rejects.toThrow()
  })
  it('tokens pertencem à janela, expiram, são substituídos e podem ser descartados', () => {
    let clock = 0, next = 0
    const sessions = new PackPreviewSessions(() => clock, () => String(++next))
    const token = sessions.create(1, json(), 'snapshot')
    expect(() => sessions.get(token, 2)).toThrow(/inválida/)
    sessions.discard(token, 2)
    expect(sessions.get(token, 1).fingerprint).toBe('snapshot')
    const replacement = sessions.create(1, json(), 'novo')
    expect(() => sessions.get(token, 1)).toThrow()
    clock = 15 * 60 * 1000
    expect(() => sessions.get(replacement, 1)).toThrow(/expirada/)
    const last = sessions.create(1, json(), 'último')
    sessions.clearOwner(1)
    expect(() => sessions.get(last, 1)).toThrow()
  })
})
