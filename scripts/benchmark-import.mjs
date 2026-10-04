import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir, cpus } from 'node:os'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { Worker } from 'node:worker_threads'
import { DatabaseSync } from 'node:sqlite'

// Run after pnpm build. Synthetic data; no user database or fiscal assertion.
const count = Number(process.argv[2] ?? 1000)
const testRecovery = process.argv.includes('--recover')
if (!Number.isSafeInteger(count) || count < 1 || count > 10000) throw new Error('Quantidade inválida (1–10000).')
const root = await mkdtemp(join(tmpdir(), 'contabilinico-benchmark-'))
try {
  const connection = new DatabaseSync(join(root, 'motor-icms.sqlite'), { timeout: 5000 })
  connection.exec('PRAGMA journal_mode = WAL')
  const { readdir } = await import('node:fs/promises')
  const migrationDirectory = resolve('packages/database/migrations')
  for (const name of (await readdir(migrationDirectory)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) {
    connection.exec('BEGIN IMMEDIATE')
    try { connection.exec(await readFile(join(migrationDirectory, name), 'utf8')); connection.exec('COMMIT') }
    catch (error) { connection.exec('ROLLBACK'); throw error }
  }
  const organization = randomUUID(), company = randomUUID(), now = new Date().toISOString()
  connection.prepare('INSERT INTO organizacoes (id,nome,ativo,criado_em,atualizado_em) VALUES (?,?,1,?,?)').run(organization, 'Benchmark sintético', now, now)
  connection.prepare('INSERT INTO empresas (id,organizacao_id,razao_social,cnpj,uf,ativo,criado_em,atualizado_em) VALUES (?,?,?,?,?,1,?,?)').run(company, organization, 'Benchmark sintético', '12345678000195', 'SP', now, now)
  const template = await readFile(resolve('packages/nfe-parser/test/fixtures/nfe-proc-minima.xml'), 'utf8')
  const key = '35260912345678000195550010000000011000000010'
  const sources = []
  for (let i = 0; i < count; i++) {
    const path = join(root, `nota-${String(i).padStart(5, '0')}.xml`)
    const newKey = `${key.slice(0, 35)}${String(i + 1).padStart(9, '0')}`
    await writeFile(path, template.replaceAll(key, newKey).replace('<nNF>1</nNF>', `<nNF>${i + 1}</nNF>`))
    sources.push({ path, kind: 'XML' })
  }
  const input = { operationId: randomUUID(), totalEntries: count, environmentCode: '2', sources, assignments: sources.map(({ path }) => ({ source: path, companyId: company })) }
  const started = performance.now()
  let maxDelay = 0, lastHeartbeat = started, heartbeats = 0
  const timer = setInterval(() => { const now = performance.now(); maxDelay = Math.max(maxDelay, now - lastHeartbeat - 20); lastHeartbeat = now; heartbeats++ }, 20)
  let result
  try {
    if (testRecovery) {
      await new Promise((resolve, reject) => {
        const worker = new Worker(resolveWorker(), { workerData: { input, databasePath: join(root, 'motor-icms.sqlite'), dataDirectory: root } })
        let interrupted = false
        worker.on('message', (message) => {
          if (message.type === 'PROGRESS' && message.progress.completed >= Math.min(50, count - 1) && message.progress.phase === 'PROCESSING' && !interrupted) {
            interrupted = true; void worker.terminate()
          }
          if (message.type === 'ERROR') reject(new Error(message.message))
        })
        worker.on('error', reject)
        worker.on('exit', () => interrupted ? resolve() : reject(new Error('Não foi possível simular a interrupção.')))
      })
    }
    let resumeId
    if (testRecovery) {
      const ids = await readdir(join(root, 'import-recovery'))
      resumeId = ids[0]
      if (!resumeId) throw new Error('Nenhum checkpoint após interrupção.')
      const manifest = JSON.parse(await readFile(join(root, 'import-recovery', resumeId, 'manifest.json'), 'utf8'))
      if (manifest.id !== resumeId) throw new Error('Identidade de recuperação divergente.')
    }
    result = await new Promise((resolve, reject) => {
      const worker = new Worker(resolveWorker(), { workerData: { input: { ...input, operationId: randomUUID() }, databasePath: join(root, 'motor-icms.sqlite'), dataDirectory: root, resumeId } })
      let settled = false, workerResult
      worker.on('message', (message) => {
        if (message.type === 'RESULT') { settled = true; workerResult = message }
        if (message.type === 'ERROR') { settled = true; reject(new Error(message.message)) }
      })
      worker.on('error', reject)
      worker.on('exit', (code) => { if (workerResult) resolve(workerResult); else if (!settled) reject(new Error(`Worker interrompido (${code})`)) })
    })
    if (resumeId && result.result.id !== resumeId) throw new Error('A retomada criou outro lote.')
  } finally { clearInterval(timer) }
  const stored = connection.prepare('SELECT COUNT(*) AS count FROM documentos_fiscais').get()
  if (Number(stored.count) !== count || result.result.totalDocuments !== count) throw new Error('Contagem final divergente.')
  console.log(JSON.stringify({ date: new Date().toISOString(), platform: process.platform, node: process.version, cpu: cpus()[0]?.model, notes: count, recoveredAfterWorkerTermination: testRecovery, elapsedMs: Math.round(performance.now() - started), workerMetrics: result.metrics, mainThreadHeartbeatCount: heartbeats, mainThreadMaxDelayMs: Math.round(maxDelay), finalDocuments: Number(stored.count) }, null, 2))
  connection.close()
} catch (error) {
  const { readdir } = await import('node:fs/promises')
  const dirs = await readdir(join(root, 'import-recovery')).catch(() => [])
  for (const dir of dirs.slice(0, 1)) {
    const names = await readdir(join(root, 'import-recovery', dir))
    const entry = names.find((name) => name.endsWith('.entry.json'))
    if (entry) console.error(await readFile(join(root, 'import-recovery', dir, entry), 'utf8'))
  }
  throw error
} finally { await rm(root, { recursive: true, force: true }) }
function resolveWorker() { return resolve(process.env.CONTABILINICO_WORKER_PATH ?? 'apps/desktop/out/main/batch-import-worker.js') }
