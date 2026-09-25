import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  type BatchCompanyCandidate,
  type BatchPreparation,
  type BatchDetail,
  type BuiltinRulePackSummary,
  type BatchListItem,
  type CreatedBatchSummary,
  type CreateBatchInput,
  type CompanySummary,
  type CreateCompanyInput,
  type CreateFiscalProfileInput,
  type FiscalProfileSummary,
  type SaveSupplierProductInput,
  type SupplierProductSummary,
  type CreateOrganizationInput,
  type OrganizationSummary,
  type RenameOrganizationInput,
  type SelectedSource,
  type WorkspaceState,
} from '@motor/contracts'
import {
  CORE_MIGRATIONS,
  SqliteCompanyRepository,
  SqliteFiscalCatalogRepository,
  SqliteBatchRepository,
  SqliteCalculationRepository,
  SqliteDatabase,
  SqliteOrganizationRepository,
  runSqlMigrationsWithBackup,
} from '@motor/database'
import {
  classifyDocumentIngestion,
  classifyDocumentOccurrences,
  normalizeBrazilianState,
  normalizeCnpj,
  type FiscalEnvironmentCode,
  type NormalizedNfe,
} from '@motor/domain'
import {
  PRODUCTION_XML_SECURITY_POLICY,
  PRODUCTION_ZIP_SECURITY_POLICY,
  normalizeNfeStructure,
  readNfeXmlStructure,
  visitSafeZipFileEntries,
  ZipVisitCancelledError,
} from '@motor/nfe-parser'
import { BUILTIN_ICMS_OWN_PACK, pendingCalculation } from '@motor/tax-engine'

import { BatchOperationCancelledError, BatchOperationRegistry, type BatchOperationSession } from './batch-operation'
import { classifyFiscalItem } from './fiscal-item-classification'
import { assessBuiltinRules } from './rule-pack-assessment'

const allowedExtensions = new Set(['.xml', '.zip'])
const currentDirectory = dirname(fileURLToPath(import.meta.url))
let database: SqliteDatabase | undefined
let mainWindow: BrowserWindow | undefined
const approvedSourcePaths = new Set<string>()
const batchOperations = new BatchOperationRegistry()

async function runBatchOperation<T>(
  event: Electron.IpcMainInvokeEvent,
  rawOperationId: unknown,
  phase: 'INSPECTING' | 'PROCESSING',
  total: number,
  operation: (session: BatchOperationSession) => Promise<T>,
): Promise<T> {
  const operationId = requiredInputText(rawOperationId, 'Identificador da operação')
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Total de entradas inválido.')
  const session = batchOperations.start(operationId, event.sender.id, phase, total, (progress) => {
    if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.BATCH_PROGRESS, progress)
  })
  try {
    return await operation(session)
  } finally {
    batchOperations.finish(operationId)
  }
}

function isCancelled(cause: unknown): boolean {
  return cause instanceof ZipVisitCancelledError || cause instanceof BatchOperationCancelledError
}

function activeDatabase(): SqliteDatabase {
  if (!database) throw new Error('Banco de dados ainda não está disponível.')
  return database
}

function catalogCompany(rawCompanyId: unknown) {
  const connection = activeDatabase()
  const organization = new SqliteOrganizationRepository(connection).findSingle()
  const company = new SqliteCompanyRepository(connection).findById(requiredInputText(rawCompanyId, 'Empresa'))
  if (!organization || !company || company.organizationId !== organization.id || !company.active) {
    throw new Error('Empresa ativa não encontrada nesta instalação.')
  }
  return { organization, company, connection }
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

function validatedSources(rawSources: unknown): SelectedSource[] {
  if (!Array.isArray(rawSources)) throw new Error('Lista de arquivos inválida.')
  return rawSources.map((value): SelectedSource => {
    const source = inputRecord(value)
    const path = requiredInputText(source.path, 'Caminho do arquivo')
    const kind = source.kind
    if (kind !== 'XML' && kind !== 'ZIP') throw new Error('Tipo de arquivo inválido.')
    if (!approvedSourcePaths.has(path)) throw new Error('Arquivo não autorizado pelo seletor.')
    return { path, kind }
  })
}

async function hashFile(path: string, session?: BatchOperationSession): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) {
    session?.throwIfCancelled()
    hash.update(chunk as Buffer)
  }
  session?.throwIfCancelled()
  return hash.digest('hex')
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
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return
  }
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: true,
    backgroundColor: '#f4f1e8',
    webPreferences: {
      preload: join(currentDirectory, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow = window

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(currentDirectory, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, () => app.getVersion())
  ipcMain.handle(
    IPC_CHANNELS.CANCEL_BATCH_OPERATION,
    (event, rawOperationId: unknown): boolean =>
      batchOperations.cancel(requiredInputText(rawOperationId, 'Identificador da operação'), event.sender.id),
  )
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
  ipcMain.handle(
    IPC_CHANNELS.LIST_FISCAL_PROFILES,
    (_event, rawCompanyId: unknown): readonly FiscalProfileSummary[] => {
      const { company, connection } = catalogCompany(rawCompanyId)
      return new SqliteFiscalCatalogRepository(connection).listProfiles(company.id).map((profile) => ({
        id: profile.id, companyId: profile.companyId, name: profile.name,
        validFrom: profile.validFrom,
        ...(profile.validUntil ? { validUntil: profile.validUntil } : {}),
      }))
    },
  )
  ipcMain.handle(
    IPC_CHANNELS.CREATE_FISCAL_PROFILE,
    (_event, rawInput: unknown): FiscalProfileSummary => {
      const input = inputRecord(rawInput) as unknown as CreateFiscalProfileInput
      const { organization, company, connection } = catalogCompany(input.companyId)
      const profile = new SqliteFiscalCatalogRepository(connection).createProfile({
        organizationId: organization.id,
        companyId: company.id,
        name: requiredInputText(input.name, 'Nome do perfil'),
        validFrom: requiredInputText(input.validFrom, 'Início da vigência'),
        ...(optionalInputText(input.validUntil) ? { validUntil: optionalInputText(input.validUntil)! } : {}),
      })
      return {
        id: profile.id, companyId: profile.companyId, name: profile.name,
        validFrom: profile.validFrom,
        ...(profile.validUntil ? { validUntil: profile.validUntil } : {}),
      }
    },
  )
  ipcMain.handle(
    IPC_CHANNELS.LIST_SUPPLIER_PRODUCTS,
    (_event, rawCompanyId: unknown): readonly SupplierProductSummary[] => {
      const { company, connection } = catalogCompany(rawCompanyId)
      return new SqliteFiscalCatalogRepository(connection).listSupplierProducts(company.id)
        .map(({ id, companyId, supplierCnpj, productCode, profileId }) => ({
          id, companyId, supplierCnpj, productCode, profileId,
        }))
    },
  )
  ipcMain.handle(
    IPC_CHANNELS.SAVE_SUPPLIER_PRODUCT,
    (_event, rawInput: unknown): SupplierProductSummary => {
      const input = inputRecord(rawInput) as unknown as SaveSupplierProductInput
      const { company, connection } = catalogCompany(input.companyId)
      const saved = new SqliteFiscalCatalogRepository(connection).upsertSupplierProduct({
        companyId: company.id,
        supplierCnpj: requiredInputText(input.supplierCnpj, 'CNPJ do fornecedor'),
        productCode: requiredInputText(input.productCode, 'Código do produto'),
        profileId: requiredInputText(input.profileId, 'Perfil fiscal'),
      })
      return {
        id: saved.id, companyId: saved.companyId, supplierCnpj: saved.supplierCnpj,
        productCode: saved.productCode, profileId: saved.profileId,
      }
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
    async (event, rawSources: unknown, rawOperationId: unknown): Promise<BatchPreparation> => {
      const sources = validatedSources(rawSources)
      return runBatchOperation(event, rawOperationId, 'INSPECTING', sources.filter((source) => source.kind === 'XML').length, async (session) => {

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
      const documents: BatchPreparation['documents'][number][] = []
      const environmentCodes = new Set<FiscalEnvironmentCode>()
      let inspectedXmlCount = 0
      let completedEntries = 0
      let totalEntries = sources.filter((source) => source.kind === 'XML').length

      const inspectXml = (contents: Buffer, source: string): void => {
        try {
          const normalized = normalizeNfeStructure(readNfeXmlStructure(contents.toString('utf8')))
          inspectedXmlCount += 1
          documents.push({
            source,
            accessKey: normalized.accessKey,
            number: normalized.number,
            ...(normalized.issuer.taxIdType === 'CNPJ' && normalized.issuer.taxId ? { issuerCnpj: normalizeCnpj(normalized.issuer.taxId) } : {}),
            ...(normalized.recipient?.taxIdType === 'CNPJ' && normalized.recipient.taxId ? { recipientCnpj: normalizeCnpj(normalized.recipient.taxId) } : {}),
          })
          if (normalized.environmentCode === '1' || normalized.environmentCode === '2') {
            environmentCodes.add(normalized.environmentCode)
          }
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
        session.throwIfCancelled()
        if (source.kind === 'XML') {
          const metadata = await stat(source.path)
          session.throwIfCancelled()
          if (metadata.size > PRODUCTION_XML_SECURITY_POLICY.maxBytes) {
            issues.push({ source: source.path, code: 'XML_TOO_LARGE', message: 'XML excede 10 MB.' })
          } else {
            const contents = await readFile(source.path)
            session.throwIfCancelled()
            inspectXml(contents, source.path)
          }
          completedEntries += 1
          session.report('INSPECTING', completedEntries, totalEntries, basename(source.path))
          continue
        }

        let zipCompleted = 0
        try {
          const inspection = await visitSafeZipFileEntries(
            source.path,
            PRODUCTION_ZIP_SECURITY_POLICY,
            ({ relativePath, contents }) => {
              if (relativePath.toLowerCase().endsWith('.xml')) {
                inspectXml(contents, `${source.path}#${relativePath}`)
              }
            },
            {
              signal: session.signal,
              onProgress: (completed, total, entryName) => {
                if (completed === 0) totalEntries += total
                zipCompleted = completed
                session.report('INSPECTING', completedEntries + completed, totalEntries,
                  entryName ? `${basename(source.path)}#${entryName}` : basename(source.path))
              },
            },
          )
          completedEntries += inspection.totalEntries
          for (const rejected of inspection.rejectedEntries) {
            issues.push({
              source: `${source.path}#${rejected.entryName}`,
              code: rejected.code,
              message: rejected.message,
            })
          }
        } catch (cause) {
          if (isCancelled(cause)) throw cause
          completedEntries += zipCompleted
          issues.push({
            source: source.path,
            code: 'ZIP_REJEITADO',
            message: cause instanceof Error ? cause.message : 'ZIP rejeitado.',
          })
        }
      }

      const resultCandidates: BatchCompanyCandidate[] = [...candidates.values()]
        .map((candidate) => {
          const matched = companies.find((company) => company.active && company.cnpj === candidate.cnpj)
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

      return {
        candidates: resultCandidates,
        issues,
        documents,
        inspectedXmlCount,
        totalEntries: completedEntries,
        environmentCodes: [...environmentCodes].sort(),
      }
      })
    },
  )
  ipcMain.handle(
    IPC_CHANNELS.CREATE_BATCH,
    async (event, rawInput: unknown): Promise<CreatedBatchSummary> => {
      const input = inputRecord(rawInput) as unknown as CreateBatchInput
      return runBatchOperation(event, input.operationId, 'PROCESSING', input.totalEntries, async (session) => {
      const sources = validatedSources(input.sources)
      if (sources.length === 0) throw new Error('Selecione ao menos um arquivo.')
      if (input.environmentCode !== '1' && input.environmentCode !== '2') {
        throw new Error('Confirme se o lote é de produção ou homologação.')
      }
      const environmentCode = input.environmentCode
      const connection = activeDatabase()
      const organizations = new SqliteOrganizationRepository(connection)
      const organization = organizations.findSingle()
      if (!organization) throw new Error('Configure o escritório antes de criar o lote.')
      if (!Array.isArray(input.assignments)) throw new Error('Associe uma empresa a cada nota.')
      const assignmentBySource = new Map(input.assignments.map(({ source, companyId }) => [source, companyId]))
      if (assignmentBySource.size !== input.assignments.length) throw new Error('Há associações duplicadas para uma nota.')
      const companies = new Map(new SqliteCompanyRepository(connection)
        .listByOrganization(organization.id).filter(({ active }) => active).map((company) => [company.id, company]))

      const batchId = randomUUID()
      const receivedAt = new Date().toISOString()
      type Pending = {
        relativePath: string; originalName: string; kind: 'XML' | 'ZIP';
        source?: string;
        origin: 'SELECTED_FILE' | 'ZIP_ENTRY'; containerName?: string;
        hash: string; size: number; accessKey?: string; normalized?: NormalizedNfe;
        issue?: { code: string; message: string }
      }
      const pending: Pending[] = []
      const issues: { source: string; code: string; message: string; occurrenceId?: string }[] = []
      let completedEntries = 0

      const addXml = (contents: Buffer, relativePath: string, source: string, origin: Pending['origin'], containerName?: string): void => {
        let accessKey: string | undefined
        let normalized: NormalizedNfe | undefined
        let issue: Pending['issue']
        try {
          normalized = normalizeNfeStructure(readNfeXmlStructure(contents.toString('utf8')))
          accessKey = normalized.accessKey
        } catch (cause) {
          issue = { code: 'XML_NAO_IDENTIFICADO', message: cause instanceof Error ? cause.message : 'XML inválido.' }
        }
        pending.push({
          relativePath,
          originalName: basename(relativePath),
          source,
          kind: 'XML', origin, ...(containerName ? { containerName } : {}),
          hash: createHash('sha256').update(contents).digest('hex'), size: contents.byteLength,
          ...(accessKey ? { accessKey } : {}), ...(normalized ? { normalized } : {}),
          ...(issue ? { issue } : {}),
        })
      }

      for (const source of sources) {
        if (session.cancelled) break
        const metadata = await stat(source.path)
        if (session.cancelled) break
        if (source.kind === 'XML') {
          if (metadata.size > PRODUCTION_XML_SECURITY_POLICY.maxBytes) {
            issues.push({ source: source.path, code: 'XML_TOO_LARGE', message: 'XML excede 10 MB.' })
          } else {
            const contents = await readFile(source.path)
            if (session.cancelled) break
            addXml(contents, basename(source.path), source.path, 'SELECTED_FILE')
          }
          completedEntries += 1
          session.report('PROCESSING', completedEntries, input.totalEntries, basename(source.path))
          continue
        }

        let archiveHash: string
        try {
          archiveHash = await hashFile(source.path, session)
        } catch (cause) {
          if (isCancelled(cause)) break
          throw cause
        }
        pending.push({
          relativePath: basename(source.path), originalName: basename(source.path), kind: 'ZIP',
          origin: 'SELECTED_FILE', hash: archiveHash, size: metadata.size,
        })
        let zipCompleted = 0
        try {
          const inspection = await visitSafeZipFileEntries(
            source.path,
            PRODUCTION_ZIP_SECURITY_POLICY,
            ({ relativePath, contents }) => {
              if (relativePath.toLowerCase().endsWith('.xml')) {
                addXml(contents, relativePath, `${source.path}#${relativePath}`, 'ZIP_ENTRY', basename(source.path))
              }
            },
            {
              signal: session.signal,
              onProgress: (completed, total, entryName) => {
                zipCompleted = completed
                session.report('PROCESSING', completedEntries + completed,
                  Math.max(input.totalEntries, completedEntries + total),
                  entryName ? `${basename(source.path)}#${entryName}` : basename(source.path))
              },
              onRejected: (rejected) => {
                issues.push({ source: `${basename(source.path)}#${rejected.entryName}`,
                  code: rejected.code, message: rejected.message })
              },
            },
          )
          completedEntries += inspection.totalEntries

        } catch (cause) {
          completedEntries += zipCompleted
          if (isCancelled(cause)) break
          issues.push({ source: basename(source.path), code: 'ZIP_REJEITADO', message: cause instanceof Error ? cause.message : 'ZIP rejeitado.' })
        }
      }

      await new Promise<void>((resolve) => setImmediate(resolve))
      const cancelled = session.cancelled

      const recognized = pending.filter((item) => item.normalized)
      const recognizedSources = new Set(recognized.map((item) => item.source))
      if (recognized.length === 0 && !cancelled) throw new Error('Nenhuma nota fiscal válida foi encontrada nos arquivos.')
      if (recognizedSources.size !== recognized.length) throw new Error('Há caminhos de XML duplicados nos arquivos selecionados.')
      if (!cancelled && (assignmentBySource.size !== recognized.length || [...assignmentBySource.keys()].some((source) => !recognizedSources.has(source)))) {
        throw new Error('A seleção de empresas não corresponde às notas. Inspecione os arquivos novamente.')
      }
      for (const item of recognized) {
        const company = companies.get(assignmentBySource.get(item.source!) ?? '')
        if (!company) throw new Error(`Cadastre e selecione uma empresa para ${item.relativePath}.`)
        const parties = [item.normalized!.issuer, item.normalized!.recipient]
        if (!parties.some((party) => party?.taxIdType === 'CNPJ' && party.taxId && normalizeCnpj(party.taxId) === company.cnpj)) {
          throw new Error(`O CNPJ da empresa escolhida não consta na nota ${item.relativePath}.`)
        }
      }
      const firstCompanyId = recognized.length
        ? assignmentBySource.get(recognized[0]!.source!)!
        : input.assignments[0]?.companyId
      if (!firstCompanyId || !companies.has(firstCompanyId)) throw new Error('Empresa inicial inválida para o lote.')

      pending.sort((left, right) => left.relativePath.localeCompare(right.relativePath) || left.hash.localeCompare(right.hash))
      const baseOccurrences = pending.map((item, index) => ({ item, id: randomUUID(), order: index + 1 }))
      const xmlClassifications = classifyDocumentOccurrences(
        baseOccurrences.filter(({ item }) => item.kind === 'XML').map(({ item, id, order }) => ({
          occurrenceId: id, batchId, order, contentHash: item.hash,
          ...(item.accessKey ? { accessKey: item.accessKey } : {}),
        })),
      )
      const classificationById = new Map(xmlClassifications.map((value) => [value.occurrenceId, value]))
      const occurrences = baseOccurrences.map(({ item, id, order }) => {
        const classified = classificationById.get(id)
        if (item.issue) issues.push({ source: item.relativePath, ...item.issue })
        return {
          id, batchId, originalName: item.originalName, relativePath: item.relativePath,
          detectedKind: item.kind, origin: item.origin, ...(item.containerName ? { containerName: item.containerName } : {}),
          contentHash: item.hash, sizeBytes: item.size, order,
          ...(item.accessKey ? { accessKey: item.accessKey } : {}),
          ingestionStatus: item.issue ? 'PENDENTE' as const : 'PROCESSADA' as const,
          repetition: classified?.repetition ?? 'NAO_CLASSIFICAVEL' as const,
          contentConflict: classified?.contentConflict ?? 'NAO_CLASSIFICAVEL' as const,
          ...(classified?.originalOccurrenceId ? { originalOccurrenceId: classified.originalOccurrenceId } : {}),
          eligibleForTotalsByOccurrencePolicy: classified?.eligibleForTotalsByOccurrencePolicy ?? false,
          receivedAt,
        }
      })
      const reasonMessages = {
        EMPRESA_DIVERGENTE: 'O CNPJ da empresa analisada não consta como emitente nem destinatário.',
        AMBIENTE_NAO_INFORMADO: 'O XML não informa um ambiente fiscal reconhecível.',
        AMBIENTE_DIVERGENTE: 'O ambiente do XML diverge do ambiente confirmado para o lote.',
        OCORRENCIA_INELEGIVEL: 'A ocorrência é repetida ou possui conflito de conteúdo.',
      } as const
      const documents = baseOccurrences.flatMap(({ item, id }) => {
        if (!item.normalized) return []
        const company = companies.get(assignmentBySource.get(item.source!)!)!
        const occurrence = classificationById.get(id)
        const classification = classifyDocumentIngestion(
          item.normalized,
          company.cnpj,
          environmentCode,
          occurrence?.eligibleForTotalsByOccurrencePolicy ?? false,
        )
        for (const reason of classification.pendingReasons) {
          issues.push({
            source: item.relativePath,
            code: reason,
            message: reasonMessages[reason],
            occurrenceId: id,
          })
        }
        return [{
          id: randomUUID(), batchId, occurrenceId: id, contentHash: item.hash,
          companyId: company.id,
          normalized: item.normalized,
          eligibleForProcessing: classification.eligibleForProcessing,
          ...(classification.pendingReasons.length > 0
            ? { pendingReason: classification.pendingReasons.join(',') }
            : {}),
          createdAt: receivedAt,
        }]
      })
      if (documents.length === 0) {
        issues.push({
          source: 'lote',
          code: 'LOTE_SEM_DOCUMENTOS',
          message: 'Nenhum XML de NF-e/NFC-e pôde ser normalizado neste lote.',
        })
      }
      if (cancelled) {
        issues.push({
          source: 'lote',
          code: 'IMPORTACAO_CANCELADA',
          message: `Importação cancelada após ${completedEntries} de ${session.total} entrada(s). O restante não foi processado.`,
        })
      }
      const diagnostics = issues.map((issue) => ({
        id: randomUUID(), batchId, source: issue.source, code: issue.code,
        message: issue.message, ...(issue.occurrenceId ? { occurrenceId: issue.occurrenceId } : {}),
        createdAt: receivedAt,
      }))
      session.report('SAVING', completedEntries, session.total)
      const batches = new SqliteBatchRepository(connection)
      batches.createWithOccurrences({
        id: batchId, organizationId: organization.id, companyId: firstCompanyId,
        originalName: sources.length === 1 ? basename(sources[0]!.path) : `Lote com ${sources.length} fontes`,
        receivedAt,
        status: cancelled ? 'CANCELADO' : diagnostics.length > 0 ? 'CONCLUIDO_COM_PENDENCIAS' : 'CONCLUIDO',
        ...(cancelled ? { lastCanceledAt: receivedAt } : {}),
        environmentCode,
        createdAt: receivedAt,
        updatedAt: receivedAt,
      }, occurrences, diagnostics, documents)
      const stored = batches.findById(batchId)!
      return {
        id: stored.id, status: stored.status, totalFiles: stored.totalFiles,
        totalDocuments: stored.totalDocuments, totalPendencies: stored.totalPendencies,
      }
      })
    },
  )
  ipcMain.handle(IPC_CHANNELS.LIST_BATCHES, (): readonly BatchListItem[] => {
    const connection = activeDatabase()
    const organization = new SqliteOrganizationRepository(connection).findSingle()
    if (!organization) return []
    const companies = new Map(
      new SqliteCompanyRepository(connection)
        .listByOrganization(organization.id)
        .map((company) => [company.id, company]),
    )
    const batches = new SqliteBatchRepository(connection)
    return batches.listByOrganization(organization.id).map((batch) => {
      const companyCount = batches.countCompaniesByBatch(batch.id)
      return {
        id: batch.id,
        status: batch.status,
        ...(batch.companyId ? { companyId: batch.companyId } : {}),
        ...(companyCount > 1
          ? { companyName: `${companyCount} empresas` }
          : (batch.companyId && companies.get(batch.companyId)
            ? { companyName: companies.get(batch.companyId)!.legalName }
            : {})),
        ...(batch.originalName ? { originalName: batch.originalName } : {}),
        receivedAt: batch.receivedAt,
        ...(batch.environmentCode ? { environmentCode: batch.environmentCode } : {}),
        totalFiles: batch.totalFiles,
        totalDocuments: batch.totalDocuments,
        totalPendencies: batch.totalPendencies,
      }
    })
  })
  ipcMain.handle(IPC_CHANNELS.GET_BUILTIN_RULE_PACK, (): BuiltinRulePackSummary => ({
    id: BUILTIN_ICMS_OWN_PACK.id,
    version: BUILTIN_ICMS_OWN_PACK.version,
    rules: BUILTIN_ICMS_OWN_PACK.rules.map((rule) => ({ ...rule })),
  }))
  ipcMain.handle(
    IPC_CHANNELS.GET_BATCH_DETAIL,
    (_event, rawBatchId: unknown): BatchDetail => {
      const batchId = requiredInputText(rawBatchId, 'Lote')
      const connection = activeDatabase()
      const organization = new SqliteOrganizationRepository(connection).findSingle()
      const batches = new SqliteBatchRepository(connection)
      const batch = batches.findById(batchId)
      if (!organization || !batch || batch.organizationId !== organization.id) {
        throw new Error('Lote não encontrado nesta instalação.')
      }
      const companies = new Map(new SqliteCompanyRepository(connection)
        .listByOrganization(organization.id).map((company) => [company.id, company]))
      const documents = batches.listNormalizedDocuments(batchId)
      const calculations = new SqliteCalculationRepository(connection)
      const latestCalculations = new Map(documents.map((document) => [document.id, calculations.latestByDocument(document.id)] as const))
      const catalog = new SqliteFiscalCatalogRepository(connection)
      const assignedCompanyIds = [...new Set(documents.map((document) => document.companyId).filter((id): id is string => Boolean(id)))]
      const profilesByCompany = new Map(assignedCompanyIds.map((id) => [id, catalog.listProfiles(id)] as const))
      const productsByCompany = new Map(assignedCompanyIds.map((id) => [id, catalog.listSupplierProducts(id)] as const))
      const companyIds = new Set(documents.map((document) => document.companyId).filter(Boolean))
      const companyName = companyIds.size > 1
        ? `${companyIds.size} empresas`
        : (batch.companyId ? companies.get(batch.companyId)?.legalName : undefined)
      return {
        batch: {
          id: batch.id,
          status: batch.status,
          ...(batch.companyId ? { companyId: batch.companyId } : {}),
          ...(companyName ? { companyName } : {}),
          ...(batch.originalName ? { originalName: batch.originalName } : {}),
          receivedAt: batch.receivedAt,
          ...(batch.environmentCode ? { environmentCode: batch.environmentCode } : {}),
          totalFiles: batch.totalFiles,
          totalDocuments: batch.totalDocuments,
          totalPendencies: batch.totalPendencies,
        },
        occurrences: batches.listOccurrences(batchId).map((occurrence) => ({
          id: occurrence.id,
          originalName: occurrence.originalName,
          relativePath: occurrence.relativePath,
          kind: occurrence.detectedKind,
          origin: occurrence.origin,
          contentHash: occurrence.contentHash,
          sizeBytes: occurrence.sizeBytes,
          ...(occurrence.accessKey ? { accessKey: occurrence.accessKey } : {}),
          ingestionStatus: occurrence.ingestionStatus,
          repetition: occurrence.repetition,
          contentConflict: occurrence.contentConflict,
          eligibleForTotals: occurrence.eligibleForTotalsByOccurrencePolicy,
        })),
        diagnostics: batches.listDiagnostics(batchId).map((diagnostic) => ({
          id: diagnostic.id,
          source: diagnostic.source,
          code: diagnostic.code,
          message: diagnostic.message,
        })),
        documents: documents.map(({
          id, companyId, normalized, eligibleForProcessing, pendingReason,
        }) => ({
          id,
          ...(companyId ? { companyId } : {}),
          ...(companyId && companies.get(companyId) ? { companyName: companies.get(companyId)!.legalName } : {}),
          accessKey: normalized.accessKey,
          model: normalized.model,
          number: normalized.number,
          series: normalized.series,
          ...(normalized.issuedAt ? { issuedAt: normalized.issuedAt } : {}),
          ...(normalized.environmentCode ? { environmentCode: normalized.environmentCode } : {}),
          eligibleForProcessing,
          ...(pendingReason ? { pendingReason } : {}),
          ...(normalized.issuer.name ? { issuerName: normalized.issuer.name } : {}),
          ...(normalized.issuer.taxId ? { issuerTaxId: normalized.issuer.taxId } : {}),
          ...(normalized.recipient?.name ? { recipientName: normalized.recipient.name } : {}),
          ...(normalized.recipient?.taxId ? { recipientTaxId: normalized.recipient.taxId } : {}),
          items: normalized.items.map((item) => ({
            itemNumber: item.itemNumber,
            calculation: (() => {
              const run = latestCalculations.get(id)
              const saved = run?.items.find((entry) => entry.itemNumber === item.itemNumber)
              if (saved) return { ...saved.memory, runId: run!.id, engineVersion: run!.engineVersion }
              const memory = pendingCalculation(
                'PENDING_RULE',
                'A composição da base, as exceções e o arredondamento ainda aguardam homologação fiscal.',
                [
                  ...(item.productAmount ? [{ name: 'valorProduto', value: item.productAmount, source: 'XML/item', treatment: 'UNDECIDED' as const }] : []),
                  ...(item.freightAmount ? [{ name: 'frete', value: item.freightAmount, source: 'XML/item', treatment: 'UNDECIDED' as const }] : []),
                  ...(item.insuranceAmount ? [{ name: 'seguro', value: item.insuranceAmount, source: 'XML/item', treatment: 'UNDECIDED' as const }] : []),
                  ...(item.discountAmount ? [{ name: 'desconto', value: item.discountAmount, source: 'XML/item', treatment: 'UNDECIDED' as const }] : []),
                  ...(item.otherAmount ? [{ name: 'outrasDespesas', value: item.otherAmount, source: 'XML/item', treatment: 'UNDECIDED' as const }] : []),
                  ...(item.ipiAmount ? [{ name: 'IPI', value: item.ipiAmount, source: 'XML/item', treatment: 'UNDECIDED' as const }] : []),
                ],
                {
                  ...(item.declaredIcms?.baseAmount ? { base: item.declaredIcms.baseAmount } : {}),
                  ...(item.declaredIcms?.rate ? { rate: item.declaredIcms.rate } : {}),
                  ...(item.declaredIcms?.amount ? { amount: item.declaredIcms.amount } : {}),
                },
              )
              return memory
            })(),
            ruleAssessment: assessBuiltinRules(normalized, item),
            ...classifyFiscalItem(
              companyId, normalized.issuer.taxIdType === 'CNPJ' ? normalized.issuer.taxId : undefined,
              item.supplierProductCode, normalized.issuedAt,
              profilesByCompany.get(companyId ?? '') ?? [],
              productsByCompany.get(companyId ?? '') ?? [],
            ),
            ...(item.supplierProductCode ? { supplierProductCode: item.supplierProductCode } : {}),
            ...(item.description ? { description: item.description } : {}),
            ...(item.ncm ? { ncm: item.ncm } : {}),
            ...(item.cfop ? { cfop: item.cfop } : {}),
            ...(item.productAmount ? { productAmount: item.productAmount } : {}),
            ...(item.declaredIcms?.amount ? { declaredIcmsAmount: item.declaredIcms.amount } : {}),
          })),
        })),
      }
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
