import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { CreateBatchInput, RecoverableImport } from '@motor/contracts'
import type { BatchOperationSession } from './batch-operation'

export interface RecoveryManifest {
  version: 1
  id: string
  receivedAt: string
  input: CreateBatchInput
  sources: { path: string; hash: string }[]
}
export async function hashSourceFile(path: string, session?: BatchOperationSession): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) { session?.throwIfCancelled(); hash.update(chunk as Buffer) }
  return hash.digest('hex')
}
export function recoveryDirectory(root: string, id: string): string {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Identificador de recuperação inválido.')
  return join(root, id)
}
export async function openRecovery(root: string, input: CreateBatchInput, session: BatchOperationSession, resumeId?: string): Promise<RecoveryManifest> {
  if (resumeId) {
    const manifest = await readRecovery(root, resumeId)
    for (const source of manifest.sources) {
      if (await hashSourceFile(source.path, session) !== source.hash) throw new Error(`Arquivo alterado: ${basename(source.path)}. A retomada foi bloqueada; mantenha os arquivos originais.`)
    }
    return manifest
  }
  const sources: RecoveryManifest['sources'] = []
  for (const source of input.sources) sources.push({ path: source.path, hash: await hashSourceFile(source.path, session) })
  const manifest: RecoveryManifest = { version: 1, id: randomUUID(), receivedAt: new Date().toISOString(), input, sources }
  const directory = recoveryDirectory(root, manifest.id)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest), { flag: 'wx', mode: 0o600 })
  return manifest
}
export async function readRecovery(root: string, id: string): Promise<RecoveryManifest> {
  const manifest = JSON.parse(await readFile(join(recoveryDirectory(root, id), 'manifest.json'), 'utf8')) as RecoveryManifest
  if (manifest.version !== 1 || manifest.id !== id || !Array.isArray(manifest.sources) || !Array.isArray(manifest.input?.sources)) throw new Error('Ponto de recuperação inválido.')
  return manifest
}
export async function writeCheckpoint(directory: string, value: unknown): Promise<void> {
  const name = `${randomUUID()}.entry.json`
  const temporary = join(directory, `${name}.partial`)
  await writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 })
  await rename(temporary, join(directory, name))
}
export async function readCheckpoints<T>(directory: string): Promise<T[]> {
  const entries: T[] = []
  for (const name of await readdir(directory)) {
    if (name.endsWith('.entry.json')) entries.push(JSON.parse(await readFile(join(directory, name), 'utf8')) as T)
  }
  return entries
}
export async function listRecoveries(root: string): Promise<RecoverableImport[]> {
  const result: RecoverableImport[] = []
  await mkdir(root, { recursive: true, mode: 0o700 })
  for (const id of await readdir(root)) {
    if (!/^[a-f0-9-]{36}$/.test(id)) continue
    try {
      const manifest = await readRecovery(root, id)
      const entries = (await readdir(recoveryDirectory(root, id))).filter((name) => name.endsWith('.entry.json')).length
      result.push({ id, receivedAt: manifest.receivedAt, originalName: manifest.input.sources.map((source) => basename(source.path)).join(', '), stagedEntries: entries, totalEntries: manifest.input.totalEntries })
    } catch { result.push({ id, receivedAt: '', originalName: 'Recuperação ilegível', stagedEntries: 0, totalEntries: 0, error: 'Não foi possível ler o ponto de recuperação.' }) }
  }
  return result.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
}
export async function removeRecovery(root: string, id: string): Promise<void> { await rm(recoveryDirectory(root, id), { recursive: true, force: true }) }
