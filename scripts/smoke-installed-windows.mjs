import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

// Only run on a disposable Windows runner. Uses the installed application,
// its preload and renderer; no development server or source import.
assert.equal(process.platform, 'win32')
const executable = process.argv[2]
assert.ok(executable, 'Informe o executável instalado')
const port = 19223
const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE
const child = spawn(executable, [`--remote-debugging-port=${port}`], { env: environment, stdio: 'pipe' })
let output = '', launchError
child.stdout.on('data', (data) => { output += data })
child.stderr.on('data', (data) => { output += data })
child.on('error', (error) => { launchError = error })
let socket
try {
  let page
  for (let attempt = 0; attempt < 60; attempt++) {
    if (launchError) throw launchError
    if (child.exitCode !== null) throw new Error(`Aplicativo encerrou: ${child.exitCode}\n${output}`)
    const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json()).catch(() => [])
    page = pages.find((candidate) => candidate.type === 'page' && candidate.url.startsWith('file:'))
    if (page) break
    await delay(500)
  }
  assert.ok(page, `Interface instalada não abriu\n${output}`)
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  let nextId = 0
  async function evaluate(expression) {
    const id = ++nextId
    const result = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { socket.removeEventListener('message', listener); reject(new Error('Timeout no renderer instalado')) }, 10000)
      function listener(event) {
        const message = JSON.parse(event.data)
        if (message.id !== id) return
        clearTimeout(timeout); socket.removeEventListener('message', listener)
        if (message.error || message.result?.exceptionDetails) reject(new Error(JSON.stringify(message)))
        else resolve(message.result.result.value)
      }
      socket.addEventListener('message', listener)
    })
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }))
    return result
  }
  let state
  for (let attempt = 0; attempt < 40; attempt++) {
    state = await evaluate('({ text: document.body?.innerText ?? "", bridge: typeof window.desktopApi, ready: document.readyState })')
    if (state.text.includes('ContabiliNico')) break
    await delay(250)
  }
  assert.ok(state.text.includes('ContabiliNico'), JSON.stringify(state))
  assert.ok(state.text.includes('Restaurar'), JSON.stringify(state))
  assert.equal(state.bridge, 'object', 'Preload instalado indisponível')
  console.log(JSON.stringify({ installedRenderer: 'ok', platform: process.platform, page: page.url, ready: state.ready }))
} finally {
  socket?.close()
  if (child.pid) {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'])
      killer.on('exit', resolve); killer.on('error', resolve)
    })
  }
}
