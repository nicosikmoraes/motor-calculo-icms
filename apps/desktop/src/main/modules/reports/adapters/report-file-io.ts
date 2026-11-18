import { open, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

/** Escrita na mesma pasta com troca atômica: falhas preservam o arquivo anterior. */
export async function writeExcelFile(path: string, bytes: Uint8Array): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    const file = await open(temporary, 'wx', 0o600)
    try { await file.writeFile(bytes); await file.sync() } finally { await file.close() }
    await rename(temporary, path)
  } finally { await rm(temporary, { force: true }) }
}
