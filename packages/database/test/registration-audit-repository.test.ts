import { describe, expect, it } from 'vitest'
import { RegistrationEntityCode, RegistrationOperationCode } from '@motor/domain'
import { CORE_MIGRATIONS, SqliteDatabase, SqliteRegistrationAuditRepository,
  auditRetentionCutoff, runSqlMigrations } from '../src'

describe('auditoria cadastral', () => {
  it('consulta por entidade e operação e retém o evento no limite exato', () => {
    const database = new SqliteDatabase(':memory:')
    try {
      runSqlMigrations(database, CORE_MIGRATIONS, { appVersion: 'test' })
      const audit = new SqliteRegistrationAuditRepository(database)
      const event = {
        entity: RegistrationEntityCode.COMPANY, entityId: 'empresa-1',
        operation: RegistrationOperationCode.CREATE, revision: 1,
        changes: { legalName: { before: null, after: 'Empresa' } },
        computer: 'pc', systemUser: 'usuario',
      }
      audit.append({ ...event, createdAt: '2026-03-29T12:00:00.000Z' })
      audit.append({ ...event, entityId: 'empresa-2', createdAt: '2026-03-29T11:59:59.999Z' })
      const cutoff = auditRetentionCutoff(new Date('2026-09-29T12:00:00.000Z'))
      expect(cutoff).toBe('2026-03-29T12:00:00.000Z')
      expect(audit.purgeBefore(cutoff, '2026-09-29T12:00:00.000Z')).toBe(1)
      expect(audit.list({ entity: RegistrationEntityCode.COMPANY, entityId: 'empresa-1',
        operation: RegistrationOperationCode.CREATE })).toHaveLength(1)
      expect(audit.list()).toHaveLength(1)
      expect(database.get<{ removidos: number }>('SELECT removidos FROM auditoria_retencao_execucoes')?.removidos).toBe(1)
      expect(() => database.run('DELETE FROM eventos_auditoria_cadastro')).toThrow(/imutáveis/)
    } finally { database.close() }
  })

  it('ajusta dia 31 para o último dia do mês de destino', () => {
    expect(auditRetentionCutoff(new Date('2026-03-31T09:15:00.000Z')))
      .toBe('2025-09-30T09:15:00.000Z')
  })
})
