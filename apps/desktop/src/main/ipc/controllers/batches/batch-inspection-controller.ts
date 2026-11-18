import { dialog } from 'electron'
import { IPC_CHANNELS, type BatchPreparation, type SelectedSource } from '@motor/contracts'
import { SqliteCompanyRepository, SqliteOrganizationRepository } from '@motor/database'
import { AppError, AppErrorCode } from '@motor/domain'
import { inspectBatchSources } from '../../../modules/batches/adapters/files/inspect-batch-sources'
import { activeDatabase } from '../../../platform/sqlite/database-runtime'
import type { RegisterIpcRoute } from '../../route-registry'
import { runBatchOperation } from './batch-operation-context'
import { approveSelectedSources, validatedSources } from './selected-sources'

const allowedExtensions = new Set(['.xml', '.zip'])

/** Seleciona arquivos autorizados e inspeciona suas notas antes da confirmação do lote. */
export function registerBatchInspectionHandlers(register: RegisterIpcRoute): void {
  register(IPC_CHANNELS.SELECT_SOURCES, async (): Promise<SelectedSource[]> => {
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
    approveSelectedSources(selected)
    return selected
  })
  register(
    IPC_CHANNELS.INSPECT_SOURCES,
    async (event, rawSources: unknown, rawOperationId: unknown): Promise<BatchPreparation> => {
      const sources = validatedSources(rawSources)
      return runBatchOperation(event, rawOperationId, 'INSPECTING', sources.filter((source) => source.kind === 'XML').length, async (session) => {

        const connection = activeDatabase()
        const organization = new SqliteOrganizationRepository(connection).findSingle()
        if (!organization) throw new AppError(AppErrorCode.ORGANIZATION_REQUIRED, { action: 'importar arquivos' })
        const companies = new SqliteCompanyRepository(connection).listByOrganization(organization.id)
        return inspectBatchSources(sources, companies, session)
      })
    },
  )
}
