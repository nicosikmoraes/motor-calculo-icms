import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CORE_MIGRATIONS, SqliteDatabase, SqliteOrganizationRepository, SqliteCompanyRepository, SqliteBatchRepository, runSqlMigrations } from '@motor/database'
import type { CreateBatchInput } from '@motor/contracts'
import { BatchOperationRegistry } from '../src/main/batch-operation'
import { importBatch } from '../src/main/import-batch'
import { listRecoveries, readRecovery, recoveryDirectory } from '../src/main/import-recovery'
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup() })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'import-recovery-test-'))
  const database = new SqliteDatabase(join(root, 'motor-icms.sqlite'))
  runSqlMigrations(database, CORE_MIGRATIONS, { appVersion: 'test' })
  const organizationId = randomUUID(), companyId = randomUUID(), now = new Date().toISOString()
  new SqliteOrganizationRepository(database).create({ id: organizationId, name: 'Sintético', active: true, revision: 1, createdAt: now, updatedAt: now })
  new SqliteCompanyRepository(database).create({ id: companyId, organizationId, legalName: 'Sintética', cnpj: '12345678000195', state: 'SP', active: true, createdAt: now, updatedAt: now })
  const xml = await readFile(new URL('../../../packages/nfe-parser/test/fixtures/nfe-proc-minima.xml', import.meta.url), 'utf8')
  const sources = [0, 1, 2].map((i) => ({ path: join(root, `nota-${i}.xml`), kind: 'XML' as const }))
  for (const source of sources) await writeFile(source.path, xml)
  const input: CreateBatchInput = { operationId: randomUUID(), totalEntries: 3, environmentCode: '2', sources, assignments: sources.map(({ path }) => ({ source: path, companyId })) }
  cleanups.push(async () => { database.close(); await rm(root, { recursive: true, force: true }) })
  return { root, database, input, xml, recoveryRoot: join(root, 'import-recovery') }
}
describe('recuperação de importação', () => {
  it('pausa e retoma com a mesma identidade, sem duplicar notas ou perder classificação', async () => {
    const f = await fixture()
    const registry = new BatchOperationRegistry()
    const session = registry.start(f.input.operationId, 1, 'PROCESSING', 3, (progress) => {
      if (progress.completed === 1 && progress.phase === 'PROCESSING') registry.pause(f.input.operationId, 1)
    })
    const paused = await importBatch(f.input, session, f.database, f.root)
    registry.finish(f.input.operationId)
    expect(paused.status).toBe('INTERROMPIDO')
    expect(new SqliteBatchRepository(f.database).findById(paused.id)).toBeUndefined()
    const recoveries = await listRecoveries(f.recoveryRoot)
    expect(recoveries[0]?.stagedEntries).toBe(1)
    const manifest = await readRecovery(f.recoveryRoot, paused.id)
    const resumedInput = { ...manifest.input, operationId: randomUUID() }
    const resumed = registry.start(resumedInput.operationId, 1, 'PROCESSING', 3, () => {})
    const result = await importBatch(resumedInput, resumed, f.database, f.root, paused.id)
    expect(result.id).toBe(paused.id)
    expect(result.totalDocuments).toBe(3)
    const occurrences = new SqliteBatchRepository(f.database).listOccurrences(result.id)
    expect(occurrences.filter((entry) => entry.repetition === 'ORIGINAL')).toHaveLength(1)
    expect(occurrences.filter((entry) => entry.repetition === 'REPETIDA')).toHaveLength(2)
    expect(await listRecoveries(f.recoveryRoot)).toEqual([])
  }, 30_000)
  it('retoma ZIP sem duplicar o container nem suas entradas', async () => {
    const f = await fixture()
    const require = createRequire(new URL('../../../packages/nfe-parser/package.json', import.meta.url))
    const archive = new (require('yazl').ZipFile)()
    for (let i = 0; i < 3; i++) archive.addBuffer(Buffer.from(f.xml), `nota-${i}.xml`)
    const chunks: Buffer[] = []
    const buffer = new Promise<Buffer>((resolve, reject) => {
      archive.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk))
      archive.outputStream.on('end', () => resolve(Buffer.concat(chunks)))
      archive.outputStream.on('error', reject)
    })
    archive.end()
    const path = join(f.root, 'notas.zip')
    await writeFile(path, await buffer)
    const input = { ...f.input, sources: [{ path, kind: 'ZIP' as const }], assignments: f.input.assignments.map((entry, i) => ({ ...entry, source: `${path}#nota-${i}.xml` })) }
    const registry = new BatchOperationRegistry()
    const session = registry.start(input.operationId, 1, 'PROCESSING', 3, (progress) => {
      if (progress.completed === 1 && progress.phase === 'PROCESSING') registry.pause(input.operationId, 1)
    })
    const paused = await importBatch(input, session, f.database, f.root)
    registry.finish(input.operationId)
    const nextInput = { ...input, operationId: randomUUID() }
    const next = registry.start(nextInput.operationId, 1, 'PROCESSING', 3, () => {})
    const result = await importBatch(nextInput, next, f.database, f.root, paused.id)
    expect(result.totalFiles).toBe(4)
    expect(result.totalDocuments).toBe(3)
    expect(await listRecoveries(f.recoveryRoot)).toEqual([])
  }, 30_000)
  it('conserva checkpoints após uma exceção e bloqueia fonte alterada na retomada', async () => {
    const f = await fixture()
    const registry = new BatchOperationRegistry()
    const session = registry.start(f.input.operationId, 1, 'PROCESSING', 3, (progress) => {
      if (progress.completed === 1) throw new Error('Simulação de queda depois da primeira entrada')
    })
    await expect(importBatch(f.input, session, f.database, f.root)).rejects.toThrow('queda')
    registry.finish(f.input.operationId)
    const recovery = (await listRecoveries(f.recoveryRoot))[0]!
    expect(recovery.stagedEntries).toBe(1)
    const files = await readdir(recoveryDirectory(f.recoveryRoot, recovery.id))
    expect(files.filter((file) => file.endsWith('.entry.json'))).toHaveLength(1)
    await writeFile(f.input.sources[0]!.path, f.xml.replace('EMPRESA EMITENTE TESTE', 'FONTE ALTERADA'))
    const resumed = registry.start(randomUUID(), 1, 'PROCESSING', 3, () => {})
    await expect(importBatch(f.input, resumed, f.database, f.root, recovery.id)).rejects.toThrow('Arquivo alterado')
    expect((await listRecoveries(f.recoveryRoot))[0]?.stagedEntries).toBe(1)
    expect(new SqliteBatchRepository(f.database).findById(recovery.id)).toBeUndefined()
  }, 30_000)
})
