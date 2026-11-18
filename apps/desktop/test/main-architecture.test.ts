import { readdirSync, readFileSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = fileURLToPath(new URL('../src/', import.meta.url))
const main = join(src, 'main')
const modules = join(main, 'modules')

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = join(root, entry.name)
    return entry.isDirectory() ? sourceFiles(file) : /\.(ts|vue)$/.test(entry.name) ? [file] : []
  })
}

function imports(code: string): string[] {
  return [...code.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g)].map((match) => match[1])
}

describe('fronteiras do processo principal', () => {
  it('concentra ipcMain.handle no registro central', () => {
    const registrars = sourceFiles(main).filter((file) => /\bipcMain\s*\.\s*handle\s*\(/.test(readFileSync(file, 'utf8')))
    expect(registrars).toEqual([join(main, 'ipc', 'routes.ts')])
  })

  it('mantém módulos independentes de controllers IPC e da inicialização do Electron', () => {
    const violations = sourceFiles(modules).flatMap((file) => imports(readFileSync(file, 'utf8')).flatMap((specifier) => {
      if (!specifier.startsWith('.')) return []
      const [directory] = relative(main, resolve(dirname(file), specifier)).split(sep)
      return ['ipc', 'bootstrap'].includes(directory) ? [`${relative(src, file)}: ${specifier}`] : []
    }))
    expect(violations).toEqual([])
  })

  it('mantém o domínio fiscal independente de SQLite e do processo Electron', () => {
    const domain = join(modules, 'fiscal', 'domain')
    const violations = sourceFiles(domain).flatMap((file) => imports(readFileSync(file, 'utf8')).flatMap((specifier) => {
      const outsideDomain = specifier.startsWith('.') && relative(domain, resolve(dirname(file), specifier)).split(sep)[0] === '..'
      return outsideDomain || isBuiltin(specifier) || /^(?:electron|@motor\/database)(?:\/|$)/.test(specifier)
        ? [`${relative(src, file)}: ${specifier}`] : []
    }))
    expect(violations).toEqual([])
  })

  it('mantém Electron, Node e SQLite fora do renderer', () => {
    const violations = sourceFiles(join(src, 'renderer')).flatMap((file) => imports(readFileSync(file, 'utf8')).flatMap((specifier) => {
      const [directory] = specifier.startsWith('.') ? relative(src, resolve(dirname(file), specifier)).split(sep) : []
      return /^(?:electron(?:\/|$)|node:|@motor\/database(?:\/|$))/.test(specifier) || directory === 'main'
        ? [`${relative(src, file)}: ${specifier}`] : []
    }))
    expect(violations).toEqual([])
  })
})
