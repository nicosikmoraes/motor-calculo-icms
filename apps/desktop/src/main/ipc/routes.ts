import { IPC_CHANNELS } from '@motor/contracts'
import { app, ipcMain } from 'electron'
import { createApiSession } from '../modules/accounts/adapters/http/api-session'
import { donationApiBaseUrl } from '../modules/accounts/adapters/http/api-availability'
import { createDonationsClient } from '../modules/donations/adapters/http/donations-client'
import { createVersionedRuleUseCases } from '../modules/fiscal/adapters/sqlite/versioned-rules'
import { createRegistrationUseCases } from '../modules/registrations/adapters/sqlite-registrations'
import { activeDatabase } from '../platform/sqlite/database-runtime'
import { registerAccountRoutes } from './controllers/accounts/accounts-controller'
import { registerBackupHandlers } from './controllers/backup/backup-controller'
import { registerBatchCreateHandler } from './controllers/batches/batch-import-controller'
import { registerBatchInspectionHandlers } from './controllers/batches/batch-inspection-controller'
import { registerBatchOperationRoutes } from './controllers/batches/batch-operation-controller'
import { registerBatchQueryHandlers } from './controllers/batches/batch-query-controller'
import { registerBatchReassessmentHandler } from './controllers/batches/batch-reassessment-controller'
import { registerDonationRoutes } from './controllers/donations/donations-controller'
import { registerConflictResolutionHandlers } from './controllers/fiscal/conflict-resolution-controller'
import { registerDocumentReviewHandlers } from './controllers/fiscal/document-review-controller'
import { registerItemFiscalHandlers } from './controllers/fiscal/item-fiscal-controller'
import { registerFiscalRuleRoutes } from './controllers/fiscal/rules-controller'
import { registerInterchangeHandlers } from './controllers/interchange/interchange-controller'
import { registerRegistrationRoutes } from './controllers/registrations/registrations-controller'
import { registerReportHandlers } from './controllers/reports/reports-controller'
import { createIpcRouteRegistry } from './route-registry'

/** Liga os controllers ao Electron e confere a cobertura do contrato antes de abrir a janela. */
export async function registerIpcRoutes(onSessionExpired: () => void): Promise<void> {
  const { register, assertComplete } = createIpcRouteRegistry((channel, handler) => ipcMain.handle(channel, handler))
  const session = createApiSession({ baseUrl: donationApiBaseUrl, onExpired: onSessionExpired })

  registerAccountRoutes(register, session)
  registerDonationRoutes(register, createDonationsClient(session))
  registerBatchOperationRoutes(register)
  register(IPC_CHANNELS.APP_VERSION, () => app.getVersion())
  registerRegistrationRoutes(register, () => createRegistrationUseCases(activeDatabase()))
  registerFiscalRuleRoutes(register, () => createVersionedRuleUseCases(activeDatabase()))
  registerInterchangeHandlers(register)
  registerBatchInspectionHandlers(register)
  registerBatchCreateHandler(register)
  registerBatchQueryHandlers(register)
  registerBatchReassessmentHandler(register)
  registerItemFiscalHandlers(register)
  registerDocumentReviewHandlers(register)
  registerConflictResolutionHandlers(register)
  registerReportHandlers(register)
  await registerBackupHandlers(register)
  assertComplete()
}
