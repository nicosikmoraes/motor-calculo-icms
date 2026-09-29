import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import {
  CORE_MIGRATIONS, SqliteBatchRepository, SqliteCalculationRepository,
  SqliteDatabase, SqliteOrganizationRepository, runSqlMigrations,
} from '../src'
import { pendingCalculation } from '@motor/tax-engine'

const organizationId = '00000000-0000-4000-8000-000000000001'
const batchId = '00000000-0000-4000-8000-000000000002'
const occurrenceId = '00000000-0000-4000-8000-000000000003'
const documentId = '00000000-0000-4000-8000-000000000004'
const timestamp = '2026-09-25T12:00:00.000Z'
let database: SqliteDatabase
let calculations: SqliteCalculationRepository

beforeEach(() => {
  database = new SqliteDatabase(':memory:')
  runSqlMigrations(database, CORE_MIGRATIONS, { appVersion: 'test' })
  new SqliteOrganizationRepository(database).create({
    id: organizationId, name: 'Escritório', active: true, createdAt: timestamp, updatedAt: timestamp,
  })
  new SqliteBatchRepository(database).createWithOccurrences(
    {
      id: batchId, organizationId, status: 'RECEBIDO', receivedAt: timestamp,
      createdAt: timestamp, updatedAt: timestamp,
    },
    [{
      id: occurrenceId, batchId, originalName: 'nota.xml', relativePath: 'nota.xml',
      detectedKind: 'XML', origin: 'SELECTED_FILE', contentHash: 'a'.repeat(64),
      sizeBytes: 100, order: 1, accessKey: '1'.repeat(44), ingestionStatus: 'PROCESSADA',
      repetition: 'ORIGINAL', contentConflict: 'SEM_CONFLITO',
      eligibleForTotalsByOccurrencePolicy: true, receivedAt: timestamp,
    }],
    [],
    [{
      id: documentId, batchId, occurrenceId, contentHash: 'a'.repeat(64),
      eligibleForProcessing: true, createdAt: timestamp,
      normalized: {
        kind: 'NFE', layoutVersion: '4.00', model: '55', accessKey: '1'.repeat(44),
        number: '1', series: '1', issuer: { state: 'PR' },
        items: [{ itemNumber: '1', productAmount: '100.00', source: { format: 'NFE_XML_4_00', xmlPath: 'item' } }],
        declaredTotals: {}, source: { format: 'NFE_XML_4_00', xmlPath: 'NFe' },
      },
    }],
  )
  calculations = new SqliteCalculationRepository(database)
})

afterEach(() => database.close())

describe('execuções históricas de cálculo', () => {
  it('grava memória, retoma idempotentemente e preserva a execução anterior', () => {
    const input = {
      requestId: 'pedido-1', batchId, documentId, engineVersion: '0.1.0',
      items: [{ itemNumber: '1', memory: pendingCalculation('PENDING_RULE', 'Aguardando revisão') }],
    }
    const first = calculations.save(input)
    expect(calculations.save(input).id).toBe(first.id)
    expect(() => calculations.save({ ...input, engineVersion: '0.2.0' }))
      .toThrow(/conteúdo diferente/)
    const second = calculations.save({ ...input, requestId: 'pedido-2', previousRunId: first.id })
    expect(second.id).not.toBe(first.id)
    expect(calculations.latestByDocument(documentId)?.id).toBe(second.id)
    expect(() => database.run('UPDATE execucoes_calculo SET versao_motor = ? WHERE id = ?', 'x', first.id))
      .toThrow(/imutável/)
    expect(() => database.run('DELETE FROM resultados_item_calculo WHERE execucao_id = ?', first.id))
      .toThrow(/imutável/)
  })

  it('desfaz a execução inteira se o item não existir', () => {
    expect(() => calculations.save({
      requestId: 'pedido-erro', batchId, documentId, engineVersion: '0.1.0',
      items: [{ itemNumber: '99', memory: pendingCalculation('PENDING_RULE', 'Aguardando revisão') }],
    })).toThrow()
    expect(calculations.findByRequest('pedido-erro', documentId)).toBeUndefined()
  })
})
