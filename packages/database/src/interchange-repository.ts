import { hostname, userInfo } from 'node:os'
import type { PackImportResult, PackConflictChoice } from '@motor/contracts'
import { RegistrationEntityCode, RegistrationOperationCode } from '@motor/domain'
import { createIcmsPack, parseIcmsPack, planPackImport, packStateFingerprint,
  type LocalPackState, type PackWrite, type IcmsPack } from '@motor/interchange'
import { SqliteCompanyRepository, SqliteOrganizationRepository } from './core-repositories'
import { SqliteFiscalCatalogRepository } from './fiscal-catalog-repository'
import { SqliteVersionedRuleRepository } from './versioned-rule-repository'
import { SqliteRegistrationAuditRepository } from './registration-audit-repository'
import type { SqliteDatabase } from './sqlite-database'

/** Portas de intercâmbio sobre a conexão única; não restaura histórico ou XML. */
export class SqliteInterchangeRepository {
  constructor(private readonly database: SqliteDatabase) {}
  snapshot(): LocalPackState {
    const organization = new SqliteOrganizationRepository(this.database).findSingle()
    if (!organization) throw new Error('Configure a organização antes de transferir cadastros.')
    const companies = new SqliteCompanyRepository(this.database).listByOrganization(organization.id)
    const catalog = new SqliteFiscalCatalogRepository(this.database)
    return { organizationId: organization.id,
      companies: companies.map((item) => ({ id: item.id, revision: item.revision ?? 1,
        legalName: item.legalName, ...(item.tradeName ? { tradeName: item.tradeName } : {}),
        cnpj: item.cnpj, state: item.state, active: item.active })),
      profiles: companies.flatMap((company) => catalog.listProfiles(company.id)).map((item) => ({
        id: item.id, revision: item.revision, companyId: item.companyId, name: item.name,
        validFrom: item.validFrom, ...(item.validUntil ? { validUntil: item.validUntil } : {}), active: item.active })),
      products: companies.flatMap((company) => catalog.listSupplierProducts(company.id)).map((item) => ({
        id: item.id, revision: item.revision, companyId: item.companyId, supplierCnpj: item.supplierCnpj,
        productCode: item.productCode, profileId: item.profileId, active: item.active })),
      rules: new SqliteVersionedRuleRepository(this.database).list(organization.id).map((item) => ({
        id: item.id, familyId: item.familyId, version: item.version, revision: item.revision,
        status: item.status, name: item.name, level: item.level, priority: item.priority,
        ...(item.priorityReason ? { priorityReason: item.priorityReason } : {}), validFrom: item.validFrom,
        ...(item.validUntil ? { validUntil: item.validUntil } : {}),
        ...(item.legalBasis ? { legalBasis: item.legalBasis } : {}), conditions: item.conditions })) }
  }
  exportPack(appVersion: string, createdAt: string): IcmsPack {
    return this.database.transaction(() => {
      const state = this.snapshot()
      function strip<T extends { revision: number }>(item: T): Omit<T, 'revision'> {
        const { revision: _revision, ...rest } = item; return rest
      }
      // A versão revogada mais recente não pode ressuscitar uma versão antiga no destino.
      const finalized = new Map<string, LocalPackState['rules'][number]>()
      for (const rule of state.rules) if (rule.status !== 'DRAFT') {
        const current = finalized.get(rule.familyId)
        if (!current || current.version < rule.version) finalized.set(rule.familyId, rule)
      }
      return createIcmsPack({ companies: state.companies.map(strip), profiles: state.profiles.map(strip),
        products: state.products.map(strip), rules: [...finalized.values()].filter((rule) => rule.status === 'APPROVED')
          .map((rule) => ({ ...strip(rule), status: 'APPROVED' as const, legalBasis: rule.legalBasis ?? '' })) }, { appVersion, createdAt })
    })
  }
  importPack(json: string, expectedFingerprint: string, choices: Readonly<Record<string, PackConflictChoice>>,
    timestamp: string): PackImportResult {
    const pack = parseIcmsPack(json)
    return this.database.transaction(() => {
      const state = this.snapshot()
      if (packStateFingerprint(state) !== expectedFingerprint) {
        throw new Error('Os cadastros mudaram após a prévia. Selecione novamente o pacote para revisar os conflitos.')
      }
      const plan = planPackImport(pack, state, choices)
      let created = 0, updated = 0
      for (const write of plan.writes) {
        this.write(write, state.organizationId, timestamp, pack.sha256)
        if ('before' in write && write.before) updated++; else created++
      }
      return { created, updated, kept: plan.kept }
    })
  }
  private write(write: PackWrite, organizationId: string, now: string, packHash: string): void {
    const item = write.record
    if (write.entity === 'companies') {
      const record = write.record
      if (write.before) this.database.run(`UPDATE empresas SET razao_social = ?, nome_fantasia = ?, uf = ?,
        ativo = ?, inativada_em = CASE WHEN ? IS NULL THEN NULL ELSE COALESCE(inativada_em, ?) END, atualizado_em = ?, revisao = revisao + 1 WHERE id = ? AND organizacao_id = ?`,
      record.legalName, record.tradeName ?? null, record.state, record.active ? 1 : 0, record.active ? null : now, record.active ? null : now,
      now, record.id, organizationId)
      else this.database.run(`INSERT INTO empresas
        (id, organizacao_id, razao_social, nome_fantasia, cnpj, uf, ativo, inativada_em, criado_em, atualizado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, record.id, organizationId, record.legalName,
      record.tradeName ?? null, record.cnpj, record.state, record.active ? 1 : 0, record.active ? null : now, now, now)
    } else if (write.entity === 'profiles') {
      const record = write.record
      if (write.before) this.database.run(`UPDATE perfis_fiscais SET nome = ?, vigente_de = ?, vigente_ate = ?,
        ativo = ?, inativado_em = CASE WHEN ? IS NULL THEN NULL ELSE COALESCE(inativado_em, ?) END, atualizado_em = ?, revisao = revisao + 1 WHERE id = ? AND organizacao_id = ?`,
      record.name, record.validFrom, record.validUntil ?? null, record.active ? 1 : 0, record.active ? null : now, record.active ? null : now, now, record.id, organizationId)
      else this.database.run(`INSERT INTO perfis_fiscais
        (id, organizacao_id, empresa_id, nome, vigente_de, vigente_ate, ativo, inativado_em, criado_em, atualizado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, record.id, organizationId, record.companyId,
      record.name, record.validFrom, record.validUntil ?? null, record.active ? 1 : 0, record.active ? null : now, now, now)
    } else if (write.entity === 'products') {
      const record = write.record
      if (write.before) this.database.run(`UPDATE produtos_fornecedor SET perfil_fiscal_id = ?, ativo = ?,
        inativado_em = CASE WHEN ? IS NULL THEN NULL ELSE COALESCE(inativado_em, ?) END, atualizado_em = ?, revisao = revisao + 1 WHERE id = ?`,
      record.profileId, record.active ? 1 : 0, record.active ? null : now, record.active ? null : now, now, record.id)
      else this.database.run(`INSERT INTO produtos_fornecedor
        (id, empresa_id, fornecedor_cnpj, codigo_produto, perfil_fiscal_id, ativo, inativado_em, criado_em, atualizado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, record.id, record.companyId, record.supplierCnpj, record.productCode,
      record.profileId, record.active ? 1 : 0, record.active ? null : now, now, now)
    } else {
      const record = write.record
      const family = this.database.get<{ organizacao_id: string }>('SELECT organizacao_id FROM familias_regras_fiscais WHERE id = ?', record.familyId)
      if (family && family.organizacao_id !== organizationId) throw new Error('Família de regra pertence a outra organização.')
      if (!family) new SqliteVersionedRuleRepository(this.database).createFamily(record.familyId, organizationId, now)
      this.database.run(`INSERT INTO versoes_regras_fiscais
        (id, familia_id, numero, estado, nome, nivel, prioridade, justificativa_prioridade, vigente_de,
         vigente_ate, fundamento_legal, condicoes_json, criado_em, atualizado_em, aprovado_em, aprovado_por)
        VALUES (?, ?, ?, 'APPROVED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      record.id, record.familyId, record.version, record.name, record.level, record.priority,
      record.priorityReason ?? null, record.validFrom, record.validUntil ?? null, record.legalBasis,
      JSON.stringify(record.conditions), now, now, now, userInfo().username)
      new SqliteVersionedRuleRepository(this.database).appendEvent({ versionId: record.id, operation: 'APPROVE', revision: 1,
        changes: { pacote: { before: null, after: packHash }, cadastro: { before: null, after: JSON.stringify(record) } },
        computer: hostname(), systemUser: userInfo().username, createdAt: now })
      return
    }
    const table = write.entity === 'companies' ? 'empresas' : write.entity === 'profiles' ? 'perfis_fiscais' : 'produtos_fornecedor'
    const revision = this.database.get<{ revisao: number }>(`SELECT revisao FROM ${table} WHERE id = ?`, item.id)?.revisao
    if (!revision) throw new Error('Cadastro não foi gravado.')
    new SqliteRegistrationAuditRepository(this.database).append({
      entity: write.entity === 'companies' ? RegistrationEntityCode.COMPANY
        : write.entity === 'profiles' ? RegistrationEntityCode.FISCAL_PROFILE : RegistrationEntityCode.SUPPLIER_PRODUCT,
      entityId: item.id, operation: write.before ? RegistrationOperationCode.UPDATE : RegistrationOperationCode.CREATE,
      revision, changes: { pacote: { before: null, after: packHash },
        cadastro: { before: write.before ? JSON.stringify(write.before) : null, after: JSON.stringify(item) } },
      computer: hostname(), systemUser: userInfo().username, createdAt: now })
  }
}
