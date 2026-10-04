import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteDatabase } from '@motor/database'
import { BackupService, dueBackupDate } from '../src/main/backup-service'
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup() })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'backup-test-'))
  const database = new SqliteDatabase(join(root, 'source.sqlite'))
  database.exec('CREATE TABLE evidence (value TEXT); INSERT INTO evidence VALUES (\'original\')')
  let now = new Date(2026, 9, 4, 12)
  const settings = join(root, 'settings.json')
  const destination = join(root, 'copies')
  const service = new BackupService(database, settings, '0.1.0', () => now)
  await service.initialize()
  cleanups.push(async () => { await service.stop(); database.close(); await rm(root, { recursive: true, force: true }) })
  return { database, service, settings, destination, invalidDestination: join(root, 'source.sqlite', 'impossible'), setNow: (value: Date) => { now = value } }
}
describe('backup manual e diário', () => {
  it('usa a data local e atravessa viradas de mês/ano', () => {
    expect(dueBackupDate(new Date(2027, 0, 1, 22), 23)).toBe('2026-12-31')
    expect(dueBackupDate(new Date(2027, 0, 1, 23), 23)).toBe('2027-01-01')
  })
  it('só habilita após cópia manual íntegra, inclui dados WAL e preserva snapshots', async () => {
    const f = await fixture()
    await f.service.tick()
    expect(f.service.status().enabled).toBe(false)
    const first = await f.service.create(f.destination)
    const copy = new SqliteDatabase(join(first.lastBackupPath!, 'motor-icms.sqlite'), { readOnly: true })
    try { expect(copy.get('SELECT value FROM evidence')?.value).toBe('original') } finally { copy.close() }
    const manifest = JSON.parse(await readFile(join(first.lastBackupPath!, 'manifest.json'), 'utf8'))
    expect(manifest.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.parse(await readFile(f.settings, 'utf8')).enabled).toBe(true)
    await f.service.tick()
    expect(await readdir(f.destination)).toHaveLength(1)
    f.setNow(new Date(2026, 9, 4, 23))
    await f.service.tick()
    await f.service.tick()
    expect(await readdir(f.destination)).toHaveLength(2)
    f.setNow(new Date(2026, 9, 7, 8))
    const reopened = new BackupService(f.database, f.settings, '0.1.0', () => new Date(2026, 9, 7, 8))
    await reopened.initialize()
    await reopened.tick()
    await reopened.tick()
    expect(await readdir(f.destination)).toHaveLength(3)
    await reopened.stop()
  })
  it('não ativa após falha, preserva a cópia anterior e permite repetir', async () => {
    const f = await fixture()
    await expect(f.service.create(f.invalidDestination)).rejects.toThrow()
    expect(f.service.status().enabled).toBe(false)
    await f.service.create(f.destination)
    await expect(f.service.create(f.invalidDestination)).rejects.toThrow()
    expect(f.service.status().destination).toBe(f.destination)
    expect(await readdir(f.destination)).toHaveLength(1)
    expect(f.service.status().lastError).toBeTruthy()
  })
  it('serializa cópias e aguarda a cópia antes de encerrar', async () => {
    const f = await fixture()
    const first = f.service.create(f.destination)
    await expect(f.service.create(f.destination)).rejects.toThrow('andamento')
    await f.service.stop()
    await first
    expect(f.service.status().busy).toBe(false)
    await expect(f.service.create(f.destination)).rejects.toThrow('encerrando')
  })
})
