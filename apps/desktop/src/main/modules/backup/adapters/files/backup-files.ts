import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SqliteDatabase } from '@motor/database'

export interface BackupManifest {
  format: 'contabilinico-backup'
  version: 1
  appVersion: string
  createdAt: string
  kind: 'MANUAL' | 'AUTOMATIC'
  database: 'motor-icms.sqlite'
  sha256: string
  ownerId?: string
}
export async function hashBackup(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}
export async function assertRegularFile(path: string): Promise<void> {
  if (!(await lstat(path)).isFile()) throw new Error('O backup precisa conter arquivos regulares, sem links simbólicos.')
}
export async function readBackupManifest(directory: string): Promise<BackupManifest> {
  const path = join(directory, 'manifest.json')
  await assertRegularFile(path)
  if ((await lstat(path)).size > 16 * 1024) throw new Error('Manifesto de backup excede o tamanho permitido.')
  const value = JSON.parse(await readFile(path, 'utf8')) as BackupManifest
  if (value.format !== 'contabilinico-backup' || value.version !== 1 || value.database !== 'motor-icms.sqlite' ||
    typeof value.appVersion !== 'string' || !value.appVersion ||
    (value.kind !== 'MANUAL' && value.kind !== 'AUTOMATIC') || typeof value.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(value.createdAt)) || new Date(value.createdAt).toISOString() !== value.createdAt ||
    typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256) ||
    (value.ownerId !== undefined && !/^[a-f0-9-]{36}$/.test(value.ownerId))) throw new Error('Formato ou versão de backup incompatível.')
  return value
}
export function assertDatabaseIntegrity(database: SqliteDatabase): void {
  const rows = database.all('PRAGMA integrity_check')
  if (rows.length !== 1 || rows[0]?.integrity_check !== 'ok') throw new Error('A integridade do banco do backup falhou.')
  if (database.all('PRAGMA foreign_key_check').length) throw new Error('O backup contém referências inconsistentes.')
}
export async function validateBackup(directory: string): Promise<BackupManifest> {
  const manifest = await readBackupManifest(directory)
  const path = join(directory, manifest.database)
  await assertRegularFile(path)
  if (await hashBackup(path) !== manifest.sha256) throw new Error('O SHA-256 do backup não confere. A cópia pode estar corrompida.')
  const database = new SqliteDatabase(path, { readOnly: true })
  try { assertDatabaseIntegrity(database) } finally { database.close() }
  return manifest
}
