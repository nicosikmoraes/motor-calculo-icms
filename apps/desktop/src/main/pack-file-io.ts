import { open, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PACK_MAX_BYTES, parseIcmsPack } from '@motor/interchange'

/** Leitura limitada mesmo se o arquivo crescer depois do seletor. */
export async function readPackFile(path: string): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > PACK_MAX_BYTES) throw new Error('Selecione um pacote de até 10 MiB.')
    const chunks: Buffer[] = []
    let size = 0
    for (;;) {
      const chunk = Buffer.alloc(Math.min(64 * 1024, PACK_MAX_BYTES + 1 - size))
      const { bytesRead } = await handle.read(chunk)
      if (!bytesRead) break
      size += bytesRead
      if (size > PACK_MAX_BYTES) throw new Error('O pacote excede 10 MiB.')
      chunks.push(chunk.subarray(0, bytesRead))
    }
    const data = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
    parseIcmsPack(data)
    return data
  } finally { await handle.close() }
}

/** Arquivo temporário exclusivo na mesma pasta; falha não trunca o destino. */
export async function writePackFile(path: string, json: string): Promise<void> {
  parseIcmsPack(json)
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    const handle = await open(temporary, 'wx', 0o600)
    try { await handle.writeFile(json, 'utf8'); await handle.sync() }
    finally { await handle.close() }
    await rename(temporary, path)
  } finally { await rm(temporary, { force: true }) }
}
