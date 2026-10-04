import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BackupStatus } from '@motor/contracts'
import type { SqliteDatabase } from '@motor/database'

interface BackupSettings extends Omit<BackupStatus, 'busy'> { coveredDate?: string }

/** Último encerramento diário vencido no horário local, incluindo dias com o app fechado. */
export function dueBackupDate(now: Date, hour: number): string {
  const date = new Date(now)
  if (date.getHours() < hour) date.setDate(date.getDate() - 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export class BackupService {
  private settings: BackupSettings = { enabled: false, hour: 23 }
  private pending: Promise<BackupStatus> | undefined
  private timer?: ReturnType<typeof setInterval>
  private retryAfter = 0
  private stopping = false

  constructor(private readonly database: SqliteDatabase, private readonly settingsPath: string,
    private readonly appVersion: string, private readonly now: () => Date = () => new Date()) {}

  async initialize(): Promise<void> {
    try {
      const value = JSON.parse(await readFile(this.settingsPath, 'utf8')) as BackupSettings
      if (typeof value.enabled !== 'boolean' || !Number.isInteger(value.hour) || value.hour < 0 || value.hour > 23 ||
        (value.enabled && (typeof value.destination !== 'string' || !value.destination)) ||
        (value.coveredDate !== undefined && (typeof value.coveredDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.coveredDate)))) {
        throw new Error('Configuração de backup inválida.')
      }
      this.settings = value
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.settings.lastError = 'Não foi possível ler a configuração. Faça um backup manual para reativar o agendamento.'
    }
  }

  status(): BackupStatus { return { ...this.settings, busy: Boolean(this.pending) } }

  start(): void {
    this.timer = setInterval(() => { void this.tick() }, 60_000)
    void this.tick()
  }

  async stop(): Promise<void> {
    this.stopping = true
    if (this.timer) clearInterval(this.timer)
    await this.pending?.catch(() => undefined)
  }

  async tick(): Promise<void> {
    const now = this.now()
    if (this.stopping || this.pending || !this.settings.enabled || !this.settings.destination ||
      now.getTime() < this.retryAfter || this.settings.coveredDate === dueBackupDate(now, this.settings.hour)) return
    try { await this.create(this.settings.destination, 'AUTOMATIC') }
    catch { this.retryAfter = now.getTime() + 15 * 60_000 }
  }

  async create(destination: string, kind: 'MANUAL' | 'AUTOMATIC' = 'MANUAL'): Promise<BackupStatus> {
    if (this.stopping) throw new Error('O aplicativo está encerrando.')
    if (this.pending) throw new Error('Já existe um backup em andamento.')
    this.pending = this.perform(destination, kind)
    try { await this.pending; return { ...this.settings, busy: false } }
    finally { this.pending = undefined }
  }

  private async perform(destination: string, kind: 'MANUAL' | 'AUTOMATIC'): Promise<BackupStatus> {
    const started = this.now()
    const name = `contabilinico-${started.toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`
    const temporary = join(destination, `.${name}.partial`)
    const completed = join(destination, name)
    const configTemp = `${this.settingsPath}.${randomUUID()}.tmp`
    try {
      await mkdir(destination, { recursive: true })
      await mkdir(temporary, { mode: 0o700 })
      const databasePath = join(temporary, 'motor-icms.sqlite')
      await this.database.backupTo(databasePath)
      const hash = createHash('sha256')
      for await (const chunk of createReadStream(databasePath)) hash.update(chunk)
      await writeFile(join(temporary, 'manifest.json'), JSON.stringify({
        format: 'contabilinico-backup', version: 1, appVersion: this.appVersion,
        createdAt: started.toISOString(), kind, database: 'motor-icms.sqlite', sha256: hash.digest('hex'),
        scope: 'Persisted SQLite data; external XML sources and reports are not included',
      }, null, 2), { flag: 'wx', mode: 0o600 })
      await rename(temporary, completed)
      const next: BackupSettings = { enabled: true, hour: this.settings.hour, destination,
        lastBackupAt: started.toISOString(), lastBackupPath: completed,
        coveredDate: dueBackupDate(started, this.settings.hour) }
      await writeFile(configTemp, JSON.stringify(next), { flag: 'wx', mode: 0o600 })
      await rename(configTemp, this.settingsPath)
      this.settings = next
      this.retryAfter = 0
      return this.status()
    } catch (error) {
      this.settings.lastError = error instanceof Error ? error.message : 'Falha ao criar backup.'
      throw error
    } finally {
      await rm(temporary, { recursive: true, force: true }).catch(() => undefined)
      await rm(configTemp, { force: true }).catch(() => undefined)
    }
  }
}
