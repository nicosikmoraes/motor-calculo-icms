import { lstat, readdir, readFile, rm, appendFile, rename } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { readBackupManifest, validateBackup } from './backup-files'
import type { SqliteDatabase } from '@motor/database'
import { readCheckpoints, readRecovery } from './import-recovery'

/** Só apaga cópias automáticas válidas da instalação atual, após garantir a mais recente. */
export async function pruneBackups(destination: string, ownerId: string, keep: number, protectedPath?: string): Promise<number> {
  if (!Number.isSafeInteger(keep) || keep < 0 || keep > 365) throw new Error('Retenção inválida.')
  if (keep === 0) return 0
  const candidates: { path: string; date: string }[] = []
  for (const entry of await readdir(destination, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('contabilinico-')) continue
    const path = join(destination, entry.name)
    try {
      const manifest = await readBackupManifest(path)
      if (manifest.ownerId === ownerId && manifest.kind === 'AUTOMATIC') candidates.push({ path, date: manifest.createdAt })
    } catch { /* Pacotes antigos, corrompidos e arquivos alheios são preservados. */ }
  }
  candidates.sort((a, b) => b.date.localeCompare(a.date) || b.path.localeCompare(a.path))
  if (candidates.length <= keep) return 0
  await validateBackup(candidates[0]!.path)
  let removed = 0
  for (const item of candidates.slice(keep)) {
    if (item.path === protectedPath) continue
    try { await validateBackup(item.path) } catch { continue }
    await rm(item.path, { recursive: true })
    removed++
  }
  return removed
}

/** Pontos pendentes e seus snapshots permanecem. Apenas sobras incompletas antigas são removidas. */
export async function cleanImportTemporaryFiles(dataDirectory: string, database: SqliteDatabase, now = new Date()): Promise<number> {
  const root = join(dataDirectory, 'import-recovery')
  let entries
  try { entries = await readdir(root, { withFileTypes: true }) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw error }
  let removed = 0
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name)) continue
    try {
      await readRecovery(root, entry.name)
      const directory = join(root, entry.name)
      if (database.get('SELECT id FROM lotes WHERE id = ?', entry.name)) {
        await rm(directory, { recursive: true }); removed++; continue
      }
      const checkpoints = await readCheckpoints<{ normalizedPath?: string; artifactPath?: string }>(directory)
      const referenced = new Set(checkpoints.flatMap((entry) => [entry.normalizedPath, entry.artifactPath])
        .filter((path): path is string => typeof path === 'string').map((path) => resolve(path)))
      for (const file of await readdir(directory, { withFileTypes: true })) {
        if (!file.isFile() || !/^[a-f0-9-]{36}(?:\.entry\.json\.partial|\.json)$/.test(file.name)) continue
        const path = join(directory, file.name)
        if (referenced.has(resolve(path))) continue
        if (now.getTime() - (await lstat(path)).mtimeMs > 24 * 60 * 60_000) { await rm(path); removed++ }
      }
    } catch { /* Um ponto ilegível também é preservado para diagnóstico. */ }
  }
  return removed
}
export async function cleanBackupTemporaryFiles(destination: string, ownerId: string, now = new Date()): Promise<number> {
  let removed = 0
  for (const entry of await readdir(destination, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('.contabilinico-') || !entry.name.endsWith('.partial')) continue
    const path = join(destination, entry.name)
    try {
      const markerPath = join(path, 'owner.json')
      const markerStat = await lstat(markerPath)
      if (!markerStat.isFile() || markerStat.size > 1024) continue
      const marker = JSON.parse(await readFile(markerPath, 'utf8')) as { format: string; ownerId: string }
      if (marker.format !== 'contabilinico-partial' || marker.ownerId !== ownerId) continue
      if (now.getTime() - (await lstat(path)).mtimeMs <= 24 * 60 * 60_000) continue
      await rm(path, { recursive: true }); removed++
    } catch { continue }
  }
  return removed
}
/** Log local limitado, sem dados fiscais. Falha de log não provoca exclusões adicionais. */
export async function logMaintenance(path: string, event: string, count: number): Promise<void> {
  try {
    if ((await lstat(path)).size > 1024 * 1024) {
      await rm(`${path}.previous`, { force: true })
      await rename(path, `${path}.previous`)
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  await appendFile(path, JSON.stringify({ at: new Date().toISOString(), event, count }) + '\n', { mode: 0o600 })
}


export async function cleanRestoreTemporaryFiles(dataDirectory: string, now = new Date()): Promise<number> {
  try { await lstat(join(dataDirectory, 'restore-journal.json')); return 0 }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  let removed = 0
  for (const entry of await readdir(dataDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !/^\.restore-(?:candidate|recovery)-[a-f0-9-]{36}\.sqlite$/.test(entry.name)) continue
    const path = join(dataDirectory, entry.name)
    if (now.getTime() - (await lstat(path)).mtimeMs <= 24 * 60 * 60_000) continue
    for (const suffix of ['', '-wal', '-shm']) await rm(path + suffix, { force: true })
    removed++
  }
  return removed
}
