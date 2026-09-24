import { randomUUID } from 'node:crypto'
import { normalizeCnpj } from '@motor/domain'
import type { SqliteDatabase } from './sqlite-database'

export interface FiscalProfileRecord {
  id: string
  organizationId: string
  companyId: string
  name: string
  validFrom: string
  validUntil?: string
  createdAt: string
}

export interface SupplierProductRecord {
  id: string
  companyId: string
  supplierCnpj: string
  productCode: string
  profileId: string
  createdAt: string
  updatedAt: string
}

function required(value: string, field: string): string {
  const text = value.trim()
  if (!text) throw new Error(`${field} deve ser informado.`)
  return text
}

export function fiscalDate(value: string, field: string): string {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : null
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${field} deve ser uma data válida no formato AAAA-MM-DD.`)
  }
  return value
}

export class SqliteFiscalCatalogRepository {
  constructor(private readonly database: SqliteDatabase) {}

  createProfile(input: Omit<FiscalProfileRecord, 'id' | 'createdAt'>): FiscalProfileRecord {
    const validFrom = fiscalDate(input.validFrom, 'Início da vigência')
    const validUntil = input.validUntil ? fiscalDate(input.validUntil, 'Fim da vigência') : undefined
    if (validUntil && validUntil < validFrom) throw new Error('Fim da vigência não pode ser anterior ao início.')
    const profile: FiscalProfileRecord = {
      id: randomUUID(),
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
      id: string; organizacao_id: string; empresa_id: string; nome: string;
      vigente_de: string; vigente_ate: string | null; criado_em: string
    }>(
      `SELECT id, organizacao_id, empresa_id, nome, vigente_de, vigente_ate, criado_em
       FROM perfis_fiscais WHERE empresa_id = ? ORDER BY nome COLLATE NOCASE, vigente_de, id`,
      companyId,
    ).map((row) => ({
      id: row.id, organizationId: row.organizacao_id, companyId: row.empresa_id,
      name: row.nome, validFrom: row.vigente_de,
      ...(row.vigente_ate ? { validUntil: row.vigente_ate } : {}),
      createdAt: row.criado_em,
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
    if (!profile) throw new Error('Perfil fiscal não pertence à empresa selecionada.')
    const now = new Date().toISOString()
    this.database.run(
      `INSERT INTO produtos_fornecedor
       (id, empresa_id, fornecedor_cnpj, codigo_produto, perfil_fiscal_id, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (empresa_id, fornecedor_cnpj, codigo_produto)
       DO UPDATE SET perfil_fiscal_id = excluded.perfil_fiscal_id, atualizado_em = excluded.atualizado_em`,
      randomUUID(), companyId, supplierCnpj, productCode, profileId, now, now,
    )
    const saved = this.database.get<{
      id: string; empresa_id: string; fornecedor_cnpj: string; codigo_produto: string;
      perfil_fiscal_id: string; criado_em: string; atualizado_em: string
    }>(
      `SELECT id, empresa_id, fornecedor_cnpj, codigo_produto, perfil_fiscal_id, criado_em, atualizado_em
       FROM produtos_fornecedor WHERE empresa_id = ? AND fornecedor_cnpj = ? AND codigo_produto = ?`,
      companyId, supplierCnpj, productCode,
    )
    if (!saved) throw new Error('Não foi possível consultar o produto vinculado.')
    return {
      id: saved.id, companyId: saved.empresa_id, supplierCnpj: saved.fornecedor_cnpj,
      productCode: saved.codigo_produto, profileId: saved.perfil_fiscal_id,
      createdAt: saved.criado_em, updatedAt: saved.atualizado_em,
    }
  }

  listSupplierProducts(companyId: string): readonly SupplierProductRecord[] {
    return this.database.all<{
      id: string; empresa_id: string; fornecedor_cnpj: string; codigo_produto: string;
      perfil_fiscal_id: string; criado_em: string; atualizado_em: string
    }>(
      `SELECT id, empresa_id, fornecedor_cnpj, codigo_produto, perfil_fiscal_id, criado_em, atualizado_em
       FROM produtos_fornecedor WHERE empresa_id = ?
       ORDER BY fornecedor_cnpj, codigo_produto`, companyId,
    ).map((row) => ({
      id: row.id, companyId: row.empresa_id, supplierCnpj: row.fornecedor_cnpj,
      productCode: row.codigo_produto, profileId: row.perfil_fiscal_id,
      createdAt: row.criado_em, updatedAt: row.atualizado_em,
    }))
  }
}
