import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

// CA12: só o que usa a API pede conta. O router importa telas .vue, então o teste lê a declaração das rotas.
it('só /apoio exige sessão; as telas fiscais continuam abertas sem conta', () => {
  const source = readFileSync(join(__dirname, '../src/renderer/router.ts'), 'utf8')
  const routes = [...source.matchAll(/^\s*\{ path: '([^']+)'.*$/gm)].map(([line, path]) => ({ path, guarded: /beforeEnter|requiresSession/.test(line) }))

  expect(routes.length).toBeGreaterThan(10)
  expect(routes.filter((route) => route.guarded).map((route) => route.path)).toEqual(['/apoio'])
  expect(routes.map((route) => route.path)).toEqual(expect.arrayContaining(['/', '/empresas', '/lotes', '/entrar']))
})
