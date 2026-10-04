import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CORE_MIGRATIONS, SqliteDatabase, SqliteOrganizationRepository,
  SqliteVersionedRuleRepository, runSqlMigrations,
} from '@motor/database'
import { AppErrorCode } from '@motor/domain'
import { RuleLevelCode } from '@motor/tax-engine'
import { VersionedRuleUseCases } from '../src/main/versioned-rule-use-cases'

const timestamp = '2026-09-29T21:00:00.000Z'
let database: SqliteDatabase
let cases: VersionedRuleUseCases
let repository: SqliteVersionedRuleRepository
let nextId: number
beforeEach(() => {
  database = new SqliteDatabase(':memory:')
  runSqlMigrations(database, CORE_MIGRATIONS, { appVersion: 'test' })
  new SqliteOrganizationRepository(database).createSingle({
    id: '00000000-0000-4000-8000-000000000001', name: 'Escritório', active: true,
    createdAt: timestamp, updatedAt: timestamp, revision: 1,
  })
  nextId = 2
  repository = new SqliteVersionedRuleRepository(database)
  cases = new VersionedRuleUseCases({
    transaction: (operation) => database.transaction(operation),
    organizations: new SqliteOrganizationRepository(database), rules: repository,
  }, () => '00000000-0000-4000-8000-' + (nextId++).toString(16).padStart(12, '0'), () => timestamp)
})
afterEach(() => database.close())

const draftInput = {
  name: 'Regra teste', level: RuleLevelCode.NCM, priority: 0,
  validFrom: '2026-01-01', legalBasis: 'Lei de teste', conditions: { ncm: '12345678' },
}
describe('regras fiscais versionadas', () => {
  it('recusa condições inválidas pelo processo principal sem persistir nem auditar', () => {
    expect(() => cases.createDraft({ ...draftInput, conditions: { cfop: 'texto' } }))
      .toThrowError(expect.objectContaining({ code: AppErrorCode.RULE_INVALID_CONDITIONS }))
    expect(cases.list()).toHaveLength(0)
    const draft = cases.createDraft(draftInput)
    expect(() => cases.updateDraft({ ...draftInput, id: draft.id, expectedRevision: 1,
      conditions: { cst: '0' } }))
      .toThrowError(expect.objectContaining({ code: AppErrorCode.RULE_INVALID_CONDITIONS }))
    expect(repository.get(draft.id)).toMatchObject({ revision: 1, conditions: draftInput.conditions })
    expect(cases.listAudit(draft.id)).toHaveLength(1)
  })

  it('bloqueia aprovação de rascunho legado com formato inválido e permite corrigir', () => {
    const draft = cases.createDraft(draftInput)
    database.run('UPDATE versoes_regras_fiscais SET condicoes_json = ? WHERE id = ?',
      JSON.stringify({ ncm: '123' }), draft.id)
    expect(() => cases.approve({ id: draft.id, expectedRevision: 1 }))
      .toThrowError(expect.objectContaining({ code: AppErrorCode.RULE_INVALID_CONDITIONS }))
    const corrected = cases.updateDraft({ ...draftInput, id: draft.id, expectedRevision: 1 })
    expect(cases.approve({ id: draft.id, expectedRevision: corrected.revision }).status).toBe('APPROVED')
  })

  it('cria rascunho, edita com revisão, aprova e preserva versão imutável', () => {
    const draft = cases.createDraft(draftInput)
    expect(draft).toMatchObject({ version: 1, revision: 1, status: 'DRAFT' })
    const updated = cases.updateDraft({ ...draftInput, id: draft.id, expectedRevision: 1,
      name: 'Regra corrigida' })
    expect(updated).toMatchObject({ name: 'Regra corrigida', revision: 2 })
    expect(() => cases.updateDraft({ ...draftInput, id: draft.id, expectedRevision: 1 }))
      .toThrowError(expect.objectContaining({ code: AppErrorCode.REGISTRATION_REVISION_CONFLICT }))
    const approved = cases.approve({ id: draft.id, expectedRevision: 2 })
    expect(approved).toMatchObject({ status: 'APPROVED', revision: 3 })
    expect(() => cases.updateDraft({ ...draftInput, id: draft.id, expectedRevision: 3 }))
      .toThrowError(expect.objectContaining({ code: AppErrorCode.RULE_NOT_DRAFT }))
    expect(() => database.run("UPDATE versoes_regras_fiscais SET nome = 'Alterada' WHERE id = ?", draft.id))
      .toThrow(/imutável/)
    expect(() => database.run('DELETE FROM versoes_regras_fiscais WHERE id = ?', draft.id))
      .toThrow(/não pode ser excluída/)
    expect(cases.listAudit(draft.id).map((event) => event.operation))
      .toEqual(['APPROVE', 'UPDATE_DRAFT', 'CREATE_DRAFT'])
  })

  it('gera nova versão, revoga a anterior sem mutá-la e bloqueia segundo rascunho', () => {
    const draft = cases.createDraft(draftInput)
    const approved = cases.approve({ id: draft.id, expectedRevision: draft.revision })
    const next = cases.createVersion({ id: approved.id, expectedRevision: approved.revision })
    expect(next).toMatchObject({ familyId: approved.familyId, version: 2, status: 'DRAFT' })
    expect(() => cases.createVersion({ id: approved.id, expectedRevision: approved.revision }))
      .toThrowError(expect.objectContaining({ code: AppErrorCode.RULE_DRAFT_EXISTS }))
    const revoked = cases.revoke({ id: approved.id, expectedRevision: approved.revision,
      reason: 'Correção normativa' })
    expect(revoked).toMatchObject({ status: 'REVOKED', revision: approved.revision,
      revocationReason: 'Correção normativa' })
    expect(repository.get(approved.id)?.name).toBe(approved.name)
    expect(() => cases.revoke({ id: approved.id, expectedRevision: approved.revision,
      reason: 'Outra' })).toThrowError(expect.objectContaining({ code: AppErrorCode.RULE_NOT_APPROVED }))
    expect(() => database.run('DELETE FROM revogacoes_regras_fiscais WHERE versao_id = ?', approved.id))
      .toThrow(/imutável/)
    expect(cases.list()).toHaveLength(2)
  })

  it('desfaz aprovação se a auditoria falhar e recusa revogar rascunho no banco', () => {
    const draft = cases.createDraft(draftInput)
    expect(() => database.run(`INSERT INTO revogacoes_regras_fiscais
      (versao_id, motivo, revogado_em, revogado_por) VALUES (?, 'Teste', ?, 'usuario')`,
    draft.id, timestamp)).toThrow(/Somente versão aprovada/)
    database.exec(`CREATE TRIGGER falha_auditoria_aprovacao BEFORE INSERT ON eventos_auditoria_regras
      WHEN NEW.operacao = 'APPROVE' BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;`)
    expect(() => cases.approve({ id: draft.id, expectedRevision: draft.revision }))
      .toThrow(/falha simulada/)
    expect(repository.get(draft.id)).toMatchObject({ status: 'DRAFT', revision: 1 })
    expect(cases.listAudit(draft.id)).toHaveLength(1)
  })

  it('recusa aprovação incompleta, dados inválidos e não audita tentativas falhas', () => {
    const draft = cases.createDraft({ ...draftInput, legalBasis: '', conditions: {} })
    expect(() => cases.approve({ id: draft.id, expectedRevision: draft.revision }))
      .toThrowError(expect.objectContaining({ code: AppErrorCode.RULE_APPROVAL_INCOMPLETE }))
    expect(cases.listAudit(draft.id)).toHaveLength(1)
    expect(() => cases.createDraft({ ...draftInput, priority: 1 }))
      .toThrowError(expect.objectContaining({ code: AppErrorCode.RULE_INVALID_PRIORITY }))
    expect(() => cases.createDraft({ ...draftInput, validFrom: '2026-02-30' }))
      .toThrowError(expect.objectContaining({ code: AppErrorCode.INVALID_DATE }))
    expect(cases.list()).toHaveLength(1)
  })
})
