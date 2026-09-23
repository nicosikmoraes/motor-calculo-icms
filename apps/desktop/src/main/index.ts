import { randomUUID } from 'node:crypto'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  type BatchCompanyCandidate,
  type BatchPreparation,
  type CompanySummary,
  type CreateCompanyInput,
  type CreateOrganizationInput,
  type OrganizationSummary,
  type RenameOrganizationInput,
  type SelectedSource,
  type WorkspaceState,
} from '@motor/contracts'
import {
  CORE_MIGRATIONS,
  SqliteCompanyRepository,
  SqliteDatabase,
  SqliteOrganizationRepository,
  runSqlMigrationsWithBackup,
} from '@motor/database'
import { normalizeBrazilianState, normalizeCnpj } from '@motor/domain'
import {
  PRODUCTION_XML_SECURITY_POLICY,
  PRODUCTION_ZIP_SECURITY_POLICY,
  normalizeNfeStructure,
  readNfeXmlStructure,
  visitSafeZipFileEntries,
} from '@motor/nfe-parser'

const allowedExtensions = new Set(['.xml', '.zip'])
let database: SqliteDatabase | undefined
const approvedSourcePaths = new Set<string>()

function activeDatabase(): SqliteDatabase {
  if (!database) throw new Error('Banco de dados ainda não está disponível.')
  return database
}

function inputRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Entrada inválida.')
  }
  return value as Record<string, unknown>
}

function requiredInputText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} deve ser informado.`)
  return value.trim()
}

function optionalInputText(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new Error('Campo de texto inválido.')
  return value.trim() || undefined
}

function organizationSummary(organization: { id: string; name: string }): OrganizationSummary {
  return { id: organization.id, name: organization.name }
}

function companySummary(company: {
  id: string
  legalName: string
  tradeName?: string
  cnpj: string
  state: string
  active: boolean
}): CompanySummary {
  return {
    id: company.id,
    legalName: company.legalName,
    ...(company.tradeName ? { tradeName: company.tradeName } : {}),
    cnpj: company.cnpj,
    state: company.state,
    active: company.active,
  }
}

async function openDatabase(): Promise<void> {
  const dataDirectory = app.getPath('userData')
  const backupDirectory = join(dataDirectory, 'backups')
  await mkdir(backupDirectory, { recursive: true })

  database = new SqliteDatabase(join(dataDirectory, 'motor-icms.sqlite'))
  try {
    await runSqlMigrationsWithBackup(database, CORE_MIGRATIONS, {
      appVersion: app.getVersion(),
      backupPath: join(backupDirectory, `pre-migration-${Date.now()}-${randomUUID()}.sqlite`),
    })
  } catch (error) {
    database.close()
    database = undefined
    throw error
  }
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#f4f1e8',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.once('ready-to-show', () => window.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, () => app.getVersion())
  ipcMain.handle(IPC_CHANNELS.GET_WORKSPACE, (): WorkspaceState => {
    const connection = activeDatabase()
    const organization = new SqliteOrganizationRepository(connection).findSingle()
    return {
      ...(organization ? { organization: organizationSummary(organization) } : {}),
      companies: organization
        ? new SqliteCompanyRepository(connection)
            .listByOrganization(organization.id)
            .map(companySummary)
        : [],
    }
  })
  ipcMain.handle(
    IPC_CHANNELS.CREATE_ORGANIZATION,
    (_event, rawInput: unknown): OrganizationSummary => {
      const input = inputRecord(rawInput) as unknown as CreateOrganizationInput
      const timestamp = new Date().toISOString()
      const organization = {
        id: randomUUID(),
        name: requiredInputText(input.name, 'Nome do escritório'),
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      new SqliteOrganizationRepository(activeDatabase()).createSingle(organization)
      return organizationSummary(organization)
    },
  )
  ipcMain.handle(
    IPC_CHANNELS.RENAME_ORGANIZATION,
    (_event, rawInput: unknown): OrganizationSummary => {
      const input = inputRecord(rawInput) as unknown as RenameOrganizationInput
      const repository = new SqliteOrganizationRepository(activeDatabase())
      const organization = repository.findSingle()
      if (!organization) throw new Error('Configure a organização antes de renomeá-la.')
      repository.rename(
        organization.id,
        requiredInputText(input.name, 'Nome do escritório'),
        new Date().toISOString(),
      )
      return organizationSummary(repository.findById(organization.id)!)
    },
  )
  ipcMain.handle(
    IPC_CHANNELS.CREATE_COMPANY,
    (_event, rawInput: unknown): CompanySummary => {
      const input = inputRecord(rawInput) as unknown as CreateCompanyInput
      const connection = activeDatabase()
      const organization = new SqliteOrganizationRepository(connection).findSingle()
      if (!organization) throw new Error('Configure o escritório antes de cadastrar empresas.')
      const timestamp = new Date().toISOString()
      const tradeName = optionalInputText(input.tradeName)
      const company = {
        id: randomUUID(),
        organizationId: organization.id,
        legalName: requiredInputText(input.legalName, 'Razão social'),
        ...(tradeName ? { tradeName } : {}),
        cnpj: normalizeCnpj(requiredInputText(input.cnpj, 'CNPJ')),
        state: normalizeBrazilianState(requiredInputText(input.state, 'UF')),
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      new SqliteCompanyRepository(connection).create(company)
      return companySummary(company)
    },
  )
  ipcMain.handle(IPC_CHANNELS.SELECT_SOURCES, async (): Promise<SelectedSource[]> => {
    const result = await dialog.showOpenDialog({
      title: 'Selecionar XMLs ou arquivo ZIP',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documentos fiscais', extensions: ['xml', 'zip'] },
      ],
    })

    if (result.canceled) return []

    const selected = result.filePaths
      .filter((path) => allowedExtensions.has(path.slice(path.lastIndexOf('.')).toLowerCase()))
      .map<SelectedSource>((path) => ({
        path,
        kind: path.toLowerCase().endsWith('.zip') ? 'ZIP' : 'XML',
      }))
    approvedSourcePaths.clear()
    for (const source of selected) approvedSourcePaths.add(source.path)
    return selected
  })
  ipcMain.handle(
    IPC_CHANNELS.INSPECT_SOURCES,
    async (_event, rawSources: unknown): Promise<BatchPreparation> => {
      if (!Array.isArray(rawSources)) throw new Error('Lista de arquivos inválida.')
      const sources = rawSources.map((value): SelectedSource => {
        const source = inputRecord(value)
        const path = requiredInputText(source.path, 'Caminho do arquivo')
        const kind = source.kind
        if (kind !== 'XML' && kind !== 'ZIP') throw new Error('Tipo de arquivo inválido.')
        if (!approvedSourcePaths.has(path)) throw new Error('Arquivo não autorizado pelo seletor.')
        return { path, kind }
      })

      const connection = activeDatabase()
      const organization = new SqliteOrganizationRepository(connection).findSingle()
      if (!organization) throw new Error('Configure o escritório antes de importar arquivos.')
      const companies = new SqliteCompanyRepository(connection).listByOrganization(organization.id)
      const candidates = new Map<string, {
        cnpj: string
        legalName?: string
        state?: string
        roles: Set<'ISSUER' | 'RECIPIENT'>
        documents: Set<string>
      }>()
      const issues: BatchPreparation['issues'][number][] = []
      let inspectedXmlCount = 0

      const inspectXml = (contents: Buffer, source: string): void => {
        try {
          const normalized = normalizeNfeStructure(readNfeXmlStructure(contents.toString('utf8')))
          inspectedXmlCount += 1
          for (const [party, role] of [
            [normalized.issuer, 'ISSUER'],
            [normalized.recipient, 'RECIPIENT'],
          ] as const) {
            if (party?.taxIdType !== 'CNPJ' || !party.taxId) continue
            const cnpj = normalizeCnpj(party.taxId)
            const current = candidates.get(cnpj) ?? {
              cnpj,
              ...(party.name ? { legalName: party.name } : {}),
              ...(party.state ? { state: party.state } : {}),
              roles: new Set<'ISSUER' | 'RECIPIENT'>(),
              documents: new Set<string>(),
            }
            current.roles.add(role)
            current.documents.add(normalized.accessKey)
            candidates.set(cnpj, current)
          }
        } catch (cause) {
          issues.push({
            source,
            code: 'XML_NAO_IDENTIFICADO',
            message: cause instanceof Error ? cause.message : 'XML não reconhecido.',
          })
        }
      }

      for (const source of sources) {
        if (source.kind === 'XML') {
          const metadata = await stat(source.path)
          if (metadata.size > PRODUCTION_XML_SECURITY_POLICY.maxBytes) {
            issues.push({ source: source.path, code: 'XML_TOO_LARGE', message: 'XML excede 10 MB.' })
            continue
          }
          inspectXml(await readFile(source.path), source.path)
          continue
        }

        try {
          const inspection = await visitSafeZipFileEntries(
            source.path,
            PRODUCTION_ZIP_SECURITY_POLICY,
            ({ relativePath, contents }) => {
              if (relativePath.toLowerCase().endsWith('.xml')) {
                inspectXml(contents, `${source.path}#${relativePath}`)
              }
            },
          )
          for (const rejected of inspection.rejectedEntries) {
            issues.push({
              source: `${source.path}#${rejected.entryName}`,
              code: rejected.code,
              message: rejected.message,
            })
          }
        } catch (cause) {
          issues.push({
            source: source.path,
            code: 'ZIP_REJEITADO',
            message: cause instanceof Error ? cause.message : 'ZIP rejeitado.',
          })
        }
      }

      const resultCandidates: BatchCompanyCandidate[] = [...candidates.values()]
        .map((candidate) => {
          const matched = companies.find((company) => company.cnpj === candidate.cnpj)
          return {
            cnpj: candidate.cnpj,
            ...(candidate.legalName ? { legalName: candidate.legalName } : {}),
            ...(candidate.state ? { state: candidate.state } : {}),
            roles: [...candidate.roles].sort(),
            documentCount: candidate.documents.size,
            ...(matched ? { matchedCompanyId: matched.id } : {}),
          }
        })
        .sort((left, right) => left.cnpj.localeCompare(right.cnpj))

      return { candidates: resultCandidates, issues, inspectedXmlCount }
    },
  )
}

app.whenReady().then(async () => {
  try {
    await openDatabase()
    registerIpcHandlers()
    createWindow()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha desconhecida.'
    dialog.showErrorBox('Não foi possível abrir o banco de dados', message)
    app.quit()
    return
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  database?.close()
  database = undefined
})
