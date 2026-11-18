import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { BackupStatus } from '@motor/contracts'
import { cleanBackupTemporaryFiles, cleanImportTemporaryFiles, cleanRestoreTemporaryFiles, logMaintenance, pruneBackups } from './backup-retention'
import type { SqliteDatabase } from '@motor/database'

interface BackupSettings extends Omit<BackupStatus, 'busy'> { coveredDate?: string; ownerId: string }

/** Último encerramento diário vencido no horário local, incluindo dias com o app fechado. */
export function dueBackupDate(now: Date, hour: number): string {
  const date = new Date(now)
  if (date.getHours() < hour) date.setDate(date.getDate() - 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export class BackupService {
  private settings: BackupSettings = { enabled: false, hour: 23, automaticCopiesToKeep: 7, ownerId: randomUUID() }
  private pending: Promise<BackupStatus> | undefined
  private timer?: ReturnType<typeof setInterval>
  private retryAfter = 0
  private stopping = false
  private lastCleanupDate = ''

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
      const keep = value.automaticCopiesToKeep ?? 7
      this.validateRetention(keep)
      if (value.ownerId !== undefined && !/^[a-f0-9-]{36}$/.test(value.ownerId)) throw new Error('Instalação de backup inválida.')
      this.settings = { ...value, automaticCopiesToKeep: keep, ownerId: value.ownerId ?? randomUUID() }
      await this.saveSettings(this.settings)
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
      now.getTime() < this.retryAfter) return
    const date = dueBackupDate(now, this.settings.hour)
    if (this.settings.coveredDate === date) {
      if (this.lastCleanupDate !== date) {
        this.pending = (async () => { await this.runMaintenance(); return this.status() })()
        try { await this.pending } finally { this.pending = undefined }
      }
      return
    }
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

  private validateRetention(count: number): void {
    if (!Number.isSafeInteger(count) || count < 0 || count > 365) throw new Error('Escolha de 1 a 365 cópias, ou 0 para não apagar.')
  }

  private async saveSettings(settings: BackupSettings): Promise<void> {
    const temporary = `${this.settingsPath}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, JSON.stringify(settings), { flag: 'wx', mode: 0o600 })
      await rename(temporary, this.settingsPath)
    } finally { await rm(temporary, { force: true }).catch(() => undefined) }
  }

  async setRetention(count: number): Promise<BackupStatus> {
    this.validateRetention(count)
    if (this.pending || this.stopping) throw new Error('Aguarde a operação de backup atual.')
    this.pending = (async () => {
      const next = { ...this.settings, automaticCopiesToKeep: count }
      await this.saveSettings(next)
      this.settings = next
      // A política vale na próxima manutenção; salvar não apaga imediatamente.
      this.lastCleanupDate = ''
      return this.status()
    })()
    try { await this.pending; return { ...this.settings, busy: false } }
    finally { this.pending = undefined }
  }

  private async runMaintenance(): Promise<void> {
    const destination = this.settings.destination
    if (!destination) return
    try {
      let removed = await pruneBackups(destination, this.settings.ownerId, this.settings.automaticCopiesToKeep, this.settings.lastBackupPath)
      removed += await cleanBackupTemporaryFiles(destination, this.settings.ownerId, this.now())
      removed += await cleanImportTemporaryFiles(dirname(this.settingsPath), this.database, this.now())
      removed += await cleanRestoreTemporaryFiles(dirname(this.settingsPath), this.now())
      this.settings.lastCleanupAt = this.now().toISOString()
      this.settings.lastCleanupRemoved = removed
      delete this.settings.cleanupError
      this.lastCleanupDate = dueBackupDate(this.now(), this.settings.hour)
      await this.saveSettings(this.settings)
      if (removed) await logMaintenance(join(dirname(this.settingsPath), 'maintenance.jsonl'), 'RETENTION', removed)
    } catch (error) {
      this.settings.cleanupError = error instanceof Error ? error.message : 'Falha na limpeza de backups.'
      // O backup concluído continua válido mesmo quando sua limpeza falha.
    }
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
      await writeFile(join(temporary, 'owner.json'), JSON.stringify({ format: 'contabilinico-partial', ownerId: this.settings.ownerId }), { flag: 'wx', mode: 0o600 })
      const databasePath = join(temporary, 'motor-icms.sqlite')
      await this.database.backupTo(databasePath)
      const hash = createHash('sha256')
      for await (const chunk of createReadStream(databasePath)) hash.update(chunk)
      await writeFile(join(temporary, 'manifest.json'), JSON.stringify({
        format: 'contabilinico-backup', version: 1, appVersion: this.appVersion,
        createdAt: started.toISOString(), kind, database: 'motor-icms.sqlite', sha256: hash.digest('hex'),
        ownerId: this.settings.ownerId,
        scope: 'Persisted SQLite data; external XML sources and reports are not included',
      }, null, 2), { flag: 'wx', mode: 0o600 })
      await rename(temporary, completed)
      const next: BackupSettings = { ...this.settings, enabled: true, hour: this.settings.hour, destination,
        lastBackupAt: started.toISOString(), lastBackupPath: completed,
        coveredDate: dueBackupDate(started, this.settings.hour) }
      delete next.lastError
      await writeFile(configTemp, JSON.stringify(next), { flag: 'wx', mode: 0o600 })
      await rename(configTemp, this.settingsPath)
      this.settings = next
      this.retryAfter = 0
      await this.runMaintenance()
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
