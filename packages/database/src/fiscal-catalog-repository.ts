import { AppError, AppErrorCode, type FiscalProfileEvidence } from '@motor/domain'
import { randomUUID } from 'node:crypto'
import { normalizeCnpj } from '@motor/domain'
import type { SqliteDatabase } from './sqlite-database'

export interface FiscalProfileRecord {
  id: string
  revision: number
  organizationId: string
  companyId: string
  name: string
  validFrom: string
  validUntil?: string
  createdAt: string
}

export interface SupplierProductRecord {
  id: string
  revision: number
  companyId: string
  supplierCnpj: string
  productCode: string
  profileId: string
  createdAt: string
  updatedAt: string
}

function required(value: string, field: string): string {
  const text = value.trim()
  if (!text) throw new AppError(AppErrorCode.REQUIRED_FIELD, { field })
  return text
}

export function fiscalDate(value: string, field: string): string {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : null
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new AppError(AppErrorCode.INVALID_DATE, { field })
  }
  return value
}

export class SqliteFiscalCatalogRepository {
  constructor(private readonly database: SqliteDatabase) {}

  createProfile(input: Omit<FiscalProfileRecord, 'id' | 'createdAt' | 'revision'>): FiscalProfileRecord {
    const validFrom = fiscalDate(input.validFrom, 'Início da vigência')
    const validUntil = input.validUntil ? fiscalDate(input.validUntil, 'Fim da vigência') : undefined
    if (validUntil && validUntil < validFrom) throw new AppError(AppErrorCode.INVALID_VALIDITY_RANGE)
    const profile: FiscalProfileRecord = {
      id: randomUUID(),
      revision: 1,
      organizationId: required(input.organizationId, 'Organização'),
      companyId: required(input.companyId, 'Empresa'),
      name: required(input.name, 'Nome do perfil'),
      validFrom,
      ...(validUntil ? { validUntil } : {}),
      createdAt: new Date().toISOString(),
    }
    this.database.run(
      `INSERT INTO perfis_fiscais
       (id, organizacao_id, empresa_id, nome, vigente_de, vigente_ate, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      profile.id, profile.organizationId, profile.companyId, profile.name,
      profile.validFrom, profile.validUntil ?? null, profile.createdAt,
    )
    return profile
  }

  listProfiles(companyId: string): readonly FiscalProfileRecord[] {
    return this.database.all<{
      id: string; organizacao_id: string; empresa_id: string; nome: string; revisao: number;
      vigente_de: string; vigente_ate: string | null; criado_em: string
    }>(
      `SELECT id, organizacao_id, empresa_id, nome, vigente_de, vigente_ate, criado_em, revisao
       FROM perfis_fiscais WHERE empresa_id = ? ORDER BY nome COLLATE NOCASE, vigente_de, id`,
      companyId,
    ).map((row) => ({
      id: row.id, revision: row.revisao, organizationId: row.organizacao_id, companyId: row.empresa_id,
      name: row.nome, validFrom: row.vigente_de,
      ...(row.vigente_ate ? { validUntil: row.vigente_ate } : {}),
      createdAt: row.criado_em,
    }))
  }

  /** Lê somente campos cadastrais de itens elegíveis ainda sem vínculo. */
  listProfileSuggestionEvidence(companyId: string): readonly FiscalProfileEvidence[] {
    return this.database.all<{
      documento_id: string; emissao_original: string | null; emitente_cnpj: string | null;
      codigo_produto_fornecedor: string | null; descricao: string | null;
      ncm: string | null; cest: string | null; origem: string | null
    }>(
      `SELECT d.id AS documento_id, d.emissao_original, d.emitente_cnpj,
              i.codigo_produto_fornecedor, i.descricao, i.ncm, i.cest,
              json_extract(i.dados_normalizados_json, '$.declaredIcms.originCode') AS origem
       FROM documentos_fiscais d
       JOIN itens_documento i ON i.documento_id = d.id
       WHERE d.empresa_id = ? AND d.elegivel_processamento = 1
         AND d.emitente_cnpj IS NOT NULL AND i.codigo_produto_fornecedor IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM produtos_fornecedor p
           WHERE p.empresa_id = d.empresa_id AND p.fornecedor_cnpj = d.emitente_cnpj
             AND p.codigo_produto = i.codigo_produto_fornecedor
         )
       ORDER BY d.id, i.numero_item`,
      companyId,
    ).map((row) => ({
      documentId: row.documento_id,
      ...(row.emissao_original ? { issuedAt: row.emissao_original } : {}),
      ...(row.emitente_cnpj ? { supplierCnpj: row.emitente_cnpj } : {}),
      ...(row.codigo_produto_fornecedor ? { productCode: row.codigo_produto_fornecedor } : {}),
      ...(row.descricao ? { description: row.descricao } : {}),
      ...(row.ncm ? { ncm: row.ncm } : {}),
      ...(row.cest ? { cest: row.cest } : {}),
      ...(row.origem ? { originCode: row.origem } : {}),
    }))
  }

  upsertSupplierProduct(input: Pick<SupplierProductRecord, 'companyId' | 'supplierCnpj' | 'productCode' | 'profileId'>): SupplierProductRecord {
    const companyId = required(input.companyId, 'Empresa')
    const supplierCnpj = normalizeCnpj(required(input.supplierCnpj, 'CNPJ do fornecedor'))
    const productCode = required(input.productCode, 'Código do produto')
    const profileId = required(input.profileId, 'Perfil fiscal')
    const profile = this.database.get<{ id: string }>(
      'SELECT id FROM perfis_fiscais WHERE id = ? AND empresa_id = ?', profileId, companyId,
    )
    if (!profile) throw new AppError(AppErrorCode.PROFILE_COMPANY_MISMATCH)
    const now = new Date().toISOString()
    this.database.run(
      `INSERT INTO produtos_fornecedor
       (id, empresa_id, fornecedor_cnpj, codigo_produto, perfil_fiscal_id, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (empresa_id, fornecedor_cnpj, codigo_produto)
       DO UPDATE SET perfil_fiscal_id = excluded.perfil_fiscal_id, atualizado_em = excluded.atualizado_em,
                     revisao = produtos_fornecedor.revisao + 1
       WHERE produtos_fornecedor.perfil_fiscal_id <> excluded.perfil_fiscal_id`,
      randomUUID(), companyId, supplierCnpj, productCode, profileId, now, now,
    )
    const saved = this.database.get<{
      id: string; empresa_id: string; fornecedor_cnpj: string; codigo_produto: string;
      perfil_fiscal_id: string; criado_em: string; atualizado_em: string; revisao: number
    }>(
      `SELECT id, empresa_id, fornecedor_cnpj, codigo_produto, perfil_fiscal_id, criado_em, atualizado_em, revisao
       FROM produtos_fornecedor WHERE empresa_id = ? AND fornecedor_cnpj = ? AND codigo_produto = ?`,
      companyId, supplierCnpj, productCode,
    )
    if (!saved) throw new AppError(AppErrorCode.LINKED_PRODUCT_NOT_FOUND)
    return {
      id: saved.id, revision: saved.revisao, companyId: saved.empresa_id, supplierCnpj: saved.fornecedor_cnpj,
      productCode: saved.codigo_produto, profileId: saved.perfil_fiscal_id,
      createdAt: saved.criado_em, updatedAt: saved.atualizado_em,
    }
  }

  listSupplierProducts(companyId: string): readonly SupplierProductRecord[] {
    return this.database.all<{
      id: string; empresa_id: string; fornecedor_cnpj: string; codigo_produto: string;
      perfil_fiscal_id: string; criado_em: string; atualizado_em: string; revisao: number
    }>(
      `SELECT id, empresa_id, fornecedor_cnpj, codigo_produto, perfil_fiscal_id, criado_em, atualizado_em, revisao
       FROM produtos_fornecedor WHERE empresa_id = ?
       ORDER BY fornecedor_cnpj, codigo_produto`, companyId,
    ).map((row) => ({
      id: row.id, revision: row.revisao, companyId: row.empresa_id, supplierCnpj: row.fornecedor_cnpj,
      productCode: row.codigo_produto, profileId: row.perfil_fiscal_id,
      createdAt: row.criado_em, updatedAt: row.atualizado_em,
    }))
  }
}
