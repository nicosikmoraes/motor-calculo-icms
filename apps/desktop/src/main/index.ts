import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import {
  IPC_CHANNELS,
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

const allowedExtensions = new Set(['.xml', '.zip'])
let database: SqliteDatabase | undefined

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

    return result.filePaths
      .filter((path) => allowedExtensions.has(path.slice(path.lastIndexOf('.')).toLowerCase()))
      .map((path) => ({ path, kind: path.toLowerCase().endsWith('.zip') ? 'ZIP' : 'XML' }))
  })
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
