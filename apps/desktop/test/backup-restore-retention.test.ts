import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, utimes, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CORE_MIGRATIONS, SqliteDatabase, SqliteOrganizationRepository, runSqlMigrations } from '@motor/database'
import { BackupService } from '../src/main/backup-service'
import { hashBackup } from '../src/main/backup-files'
import { installRestore, prepareRestore, recoverInterruptedRestore } from '../src/main/backup-restore'
import { cleanImportTemporaryFiles, cleanRestoreTemporaryFiles, pruneBackups } from '../src/main/backup-retention'
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup() })
async function fixture(migrations = CORE_MIGRATIONS) {
  const root = await mkdtemp(join(tmpdir(), 'restore-retention-test-'))
  const database = new SqliteDatabase(join(root, 'motor-icms.sqlite'))
  runSqlMigrations(database, migrations, { appVersion: '0.1.0' })
  const organization = randomUUID(), timestamp = new Date().toISOString()
  new SqliteOrganizationRepository(database).create({ id: organization, name: 'Nome original', active: true, revision: 1, createdAt: timestamp, updatedAt: timestamp })
  let now = new Date(2026, 9, 4, 23)
  const service = new BackupService(database, join(root, 'settings.json'), '0.1.0', () => now)
  await service.initialize()
  const destination = join(root, 'copies')
  cleanups.push(async () => { await service.stop(); if (database.isOpen) database.close(); await rm(root, { recursive: true, force: true }) })
  return { root, database, service, destination, organization, setDay: (day: number) => { now = new Date(2026, 9, day, 23) } }
}
function currentName(root: string): string {
  const database = new SqliteDatabase(join(root, 'motor-icms.sqlite'), { readOnly: true })
  try { return String(database.get('SELECT nome FROM organizacoes')?.nome) } finally { database.close() }
}
describe('restauração segura', () => {
  it('recupera dados e conserva a cópia anterior à troca', async () => {
    const f = await fixture()
    const snapshot = await f.service.create(f.destination)
    f.database.run('UPDATE organizacoes SET nome = ?', 'Estado atual')
    const prepared = await prepareRestore(snapshot.lastBackupPath!, f.root, '0.1.0')
    await installRestore(prepared, f.root, f.database, () => f.database.close())
    expect(currentName(f.root)).toBe('Nome original')
    const safety = (await readdir(join(f.root, 'backups'))).find((name) => name.startsWith('pre-restore-'))!
    const previous = new SqliteDatabase(join(f.root, 'backups', safety), { readOnly: true })
    try { expect(previous.get('SELECT nome FROM organizacoes')?.nome).toBe('Estado atual') } finally { previous.close() }
    expect(await recoverInterruptedRestore(f.root)).toBe(false)
  })
  it('reverte uma interrupção entre as duas trocas e permite abrir de novo', async () => {
    const f = await fixture()
    const snapshot = await f.service.create(f.destination)
    f.database.run('UPDATE organizacoes SET nome = ?', 'Preservar este estado')
    const prepared = await prepareRestore(snapshot.lastBackupPath!, f.root, '0.1.0')
    await expect(installRestore(prepared, f.root, f.database, () => f.database.close(), () => { throw new Error('Queda simulada') })).rejects.toThrow('Queda')
    expect(await recoverInterruptedRestore(f.root)).toBe(true)
    expect(currentName(f.root)).toBe('Preservar este estado')
    expect(await recoverInterruptedRestore(f.root)).toBe(false)
  })
  it('bloqueia backup corrompido sem alterar a conexão em uso', async () => {
    const f = await fixture()
    const snapshot = await f.service.create(f.destination)
    await writeFile(join(snapshot.lastBackupPath!, 'motor-icms.sqlite'), 'corrompido')
    await expect(prepareRestore(snapshot.lastBackupPath!, f.root, '0.1.0')).rejects.toThrow('SHA-256')
    expect(f.database.get('SELECT nome FROM organizacoes')?.nome).toBe('Nome original')
  })
  it('rejeita versão futura de schema e atualiza uma cópia antiga compatível', async () => {
    const f = await fixture(CORE_MIGRATIONS.slice(0, 11))
    const snapshot = await f.service.create(f.destination)
    const originalHash = await hashBackup(join(snapshot.lastBackupPath!, 'motor-icms.sqlite'))
    const prepared = await prepareRestore(snapshot.lastBackupPath!, f.root, '0.1.0')
    const migrated = new SqliteDatabase(prepared.path, { readOnly: true })
    try { expect(migrated.get('SELECT COUNT(*) AS count FROM schema_migrations')?.count).toBe(CORE_MIGRATIONS.length) } finally { migrated.close() }
    expect(await hashBackup(join(snapshot.lastBackupPath!, 'motor-icms.sqlite'))).toBe(originalHash)
    f.database.run('INSERT INTO schema_migrations (version,name,checksum,applied_at,app_version) VALUES (?,?,?,?,?)', 999, 'futuro', 'a'.repeat(64), new Date().toISOString(), '99.0.0')
    const future = await f.service.create(f.destination)
    await expect(prepareRestore(future.lastBackupPath!, f.root, '0.1.0')).rejects.toThrow('compatível')
  })
})
describe('retenção de cópias e temporários', () => {
  it('mantém sete automáticas e todas as manuais; não apaga cópias de outra instalação', async () => {
    const f = await fixture()
    const manual = await f.service.create(f.destination)
    for (let day = 5; day <= 14; day++) { f.setDay(day); await f.service.create(f.destination, 'AUTOMATIC') }
    const folders = await readdir(f.destination)
    expect(folders).toHaveLength(8)
    await expect(access(manual.lastBackupPath!)).resolves.toBeUndefined()
    const manifests = await Promise.all(folders.map(async (name) => JSON.parse(await readFile(join(f.destination, name, 'manifest.json'), 'utf8'))))
    expect(manifests.filter((manifest) => manifest.kind === 'AUTOMATIC')).toHaveLength(7)
    const other = await fixture()
    const external = await other.service.create(f.destination, 'AUTOMATIC')
    await f.service.setRetention(1)
    await f.service.tick()
    await expect(access(external.lastBackupPath!)).resolves.toBeUndefined()
    await expect(access(manual.lastBackupPath!)).resolves.toBeUndefined()
    expect(f.service.status().lastCleanupRemoved).toBeGreaterThanOrEqual(6)
  })
  it('zero desativa expurgo e pacote inválido é preservado', async () => {
    const f = await fixture()
    const first = await f.service.create(f.destination, 'AUTOMATIC')
    await f.service.setRetention(0)
    for (let day = 5; day <= 6; day++) { f.setDay(day); await f.service.create(f.destination, 'AUTOMATIC') }
    expect(await readdir(f.destination)).toHaveLength(3)
    await writeFile(join(first.lastBackupPath!, 'motor-icms.sqlite'), 'corrompido')
    const settings = JSON.parse(await readFile(join(f.root, 'settings.json'), 'utf8'))
    await pruneBackups(f.destination, settings.ownerId, 1)
    await expect(access(first.lastBackupPath!)).resolves.toBeUndefined()
    await expect(f.service.setRetention(-1)).rejects.toThrow('Escolha')
  })
  it('uma falha na limpeza não transforma a nova cópia em falha de backup', async () => {
    const f = await fixture()
    const first = await f.service.create(f.destination, 'AUTOMATIC')
    const manifestPath = join(first.lastBackupPath!, 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.createdAt = '9999-01-01T00:00:00.000Z'
    await writeFile(manifestPath, JSON.stringify(manifest))
    await writeFile(join(first.lastBackupPath!, 'motor-icms.sqlite'), 'corrompido')
    await f.service.setRetention(1)
    f.setDay(5)
    const next = await f.service.create(f.destination, 'AUTOMATIC')
    expect(next.lastError).toBeUndefined()
    expect(next.cleanupError).toContain('SHA-256')
    await expect(access(next.lastBackupPath!)).resolves.toBeUndefined()
    expect(await readdir(f.destination)).toHaveLength(2)
  })
  it('limpa apenas fragmentos antigos e preserva recuperação pendente e arquivos alheios', async () => {
    const f = await fixture()
    const id = randomUUID(), root = join(f.root, 'import-recovery'), dir = join(root, id)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({ version: 1, id, receivedAt: new Date().toISOString(), sources: [], input: { sources: [], totalEntries: 0 } }))
    const old = join(dir, `${randomUUID()}.entry.json.partial`)
    const recent = join(dir, `${randomUUID()}.entry.json.partial`)
    const foreign = join(dir, 'anotacao.txt')
    const referenced = join(dir, `${randomUUID()}.json`)
    const orphan = join(dir, `${randomUUID()}.json`)
    await writeFile(join(dir, `${randomUUID()}.entry.json`), JSON.stringify({ normalizedPath: referenced }))
    await writeFile(referenced, '{}')
    await writeFile(orphan, '{}')
    await Promise.all([old, recent, foreign].map((path) => writeFile(path, 'texto')))
    const date = new Date(Date.now() - 48 * 60 * 60_000)
    await utimes(old, date, date)
    await utimes(foreign, date, date)
    await utimes(referenced, date, date)
    await utimes(orphan, date, date)
    expect(await cleanImportTemporaryFiles(f.root, f.database)).toBe(2)
    await expect(access(old)).rejects.toThrow()
    await expect(access(recent)).resolves.toBeUndefined()
    await expect(access(referenced)).resolves.toBeUndefined()
    await expect(access(orphan)).rejects.toThrow()
    await expect(access(foreign)).resolves.toBeUndefined()
    await expect(access(join(dir, 'manifest.json'))).resolves.toBeUndefined()
  })
  it('limpa candidatos antigos somente quando não há journal de restauração', async () => {
    const f = await fixture()
    const candidate = join(f.root, `.restore-candidate-${randomUUID()}.sqlite`)
    await writeFile(candidate, 'fragmento abandonado')
    const old = new Date(Date.now() - 48 * 60 * 60_000)
    await utimes(candidate, old, old)
    const journal = join(f.root, 'restore-journal.json')
    await writeFile(journal, '{}')
    expect(await cleanRestoreTemporaryFiles(f.root)).toBe(0)
    await expect(access(candidate)).resolves.toBeUndefined()
    await rm(journal)
    expect(await cleanRestoreTemporaryFiles(f.root)).toBe(1)
    await expect(access(candidate)).rejects.toThrow()
  })

})
