import {
  assertCanonicalUtcTimestamp,
  normalizeBrazilianState,
  normalizeCnpj,
  type BatchStatus,
  type Company,
  type Organization,
} from '@motor/domain'
import type { SqliteDatabase } from './sqlite-database'

export type StoredIngestionStatus =
  | 'INVENTARIADA'
  | 'PROCESSADA'
  | 'PENDENTE'
  | 'REJEITADA'
  | 'IGNORADA'
export type StoredRepetition = 'NAO_CLASSIFICADA' | 'ORIGINAL' | 'REPETIDA' | 'NAO_CLASSIFICAVEL'
export type StoredContentConflict =
  | 'NAO_CLASSIFICADO'
  | 'SEM_CONFLITO'
  | 'CONFLITO_CONTEUDO'
  | 'NAO_CLASSIFICAVEL'
export type StoredFileKind = 'XML' | 'ZIP' | 'UNKNOWN'
export type StoredFileOrigin = 'SELECTED_FILE' | 'FOLDER_FILE' | 'ZIP_ENTRY'

export interface FiscalBatchRecord {
  id: string
  organizationId: string
  companyId?: string
  originalName?: string
  receivedAt: string
  status: BatchStatus
  lastCanceledAt?: string
  totalFiles: number
  totalDocuments: number
  totalPendencies: number
  createdAt: string
  updatedAt: string
}

export interface FileOccurrenceRecord {
  id: string
  batchId: string
  originalName: string
  relativePath: string
  detectedKind: StoredFileKind
  origin: StoredFileOrigin
  containerName?: string
  contentHash: string
  sizeBytes: number
  order: number
  accessKey?: string
  ingestionStatus: StoredIngestionStatus
  repetition: StoredRepetition
  contentConflict: StoredContentConflict
  originalOccurrenceId?: string
  eligibleForTotalsByOccurrencePolicy: boolean
  receivedAt: string
}

interface OrganizationRow extends Record<string, unknown> {
  id: string
  nome: string
  ativo: number
  criado_em: string
  atualizado_em: string
}

interface CompanyRow extends Record<string, unknown> {
  id: string
  organizacao_id: string
  razao_social: string
  nome_fantasia: string | null
  cnpj: string
  uf: string
  ativo: number
  inativada_em: string | null
  criado_em: string
  atualizado_em: string
}

interface BatchRow extends Record<string, unknown> {
  id: string
  organizacao_id: string
  empresa_id: string | null
  nome_original: string | null
  recebido_em: string
  status: BatchStatus
  ultimo_cancelamento_em: string | null
  total_arquivos: number
  total_notas: number
  total_pendencias: number
  criado_em: string
  atualizado_em: string
}

interface OccurrenceRow extends Record<string, unknown> {
  id: string
  lote_id: string
  nome_original: string
  caminho_relativo: string
  tipo_detectado: StoredFileKind
  origem: StoredFileOrigin
  nome_container: string | null
  hash_conteudo: string
  tamanho_bytes: number
  ordem_no_envio: number
  chave_acesso: string | null
  status_ingestao: StoredIngestionStatus
  repeticao: StoredRepetition
  conflito_conteudo: StoredContentConflict
  ocorrencia_original_id: string | null
  elegivel_totais_ocorrencia: number
  recebido_em: string
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} deve ser informado.`)
  return normalized
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function normalizedHash(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error('contentHash deve ser um SHA-256 hexadecimal com 64 caracteres.')
  }
  return normalized
}

function mapOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.nome,
    active: row.ativo === 1,
    createdAt: row.criado_em,
    updatedAt: row.atualizado_em,
  }
}

function mapCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    organizationId: row.organizacao_id,
    legalName: row.razao_social,
    ...(row.nome_fantasia ? { tradeName: row.nome_fantasia } : {}),
    cnpj: row.cnpj,
    state: normalizeBrazilianState(row.uf),
    active: row.ativo === 1,
    ...(row.inativada_em ? { inactivatedAt: row.inativada_em } : {}),
    createdAt: row.criado_em,
    updatedAt: row.atualizado_em,
  }
}

function mapBatch(row: BatchRow): FiscalBatchRecord {
  return {
    id: row.id,
    organizationId: row.organizacao_id,
    ...(row.empresa_id ? { companyId: row.empresa_id } : {}),
    ...(row.nome_original ? { originalName: row.nome_original } : {}),
    receivedAt: row.recebido_em,
    status: row.status,
    ...(row.ultimo_cancelamento_em ? { lastCanceledAt: row.ultimo_cancelamento_em } : {}),
    totalFiles: row.total_arquivos,
    totalDocuments: row.total_notas,
    totalPendencies: row.total_pendencias,
    createdAt: row.criado_em,
    updatedAt: row.atualizado_em,
  }
}

function mapOccurrence(row: OccurrenceRow): FileOccurrenceRecord {
  return {
    id: row.id,
    batchId: row.lote_id,
    originalName: row.nome_original,
    relativePath: row.caminho_relativo,
    detectedKind: row.tipo_detectado,
    origin: row.origem,
    ...(row.nome_container ? { containerName: row.nome_container } : {}),
    contentHash: row.hash_conteudo,
    sizeBytes: row.tamanho_bytes,
    order: row.ordem_no_envio,
    ...(row.chave_acesso ? { accessKey: row.chave_acesso } : {}),
    ingestionStatus: row.status_ingestao,
    repetition: row.repeticao,
    contentConflict: row.conflito_conteudo,
    ...(row.ocorrencia_original_id
      ? { originalOccurrenceId: row.ocorrencia_original_id }
      : {}),
    eligibleForTotalsByOccurrencePolicy: row.elegivel_totais_ocorrencia === 1,
    receivedAt: row.recebido_em,
  }
}

export class SqliteOrganizationRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(organization: Organization): void {
    this.database.run(
      `INSERT INTO organizacoes (id, nome, ativo, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?)`,
      requiredText(organization.id, 'organization.id'),
      requiredText(organization.name, 'organization.name'),
      organization.active ? 1 : 0,
      assertCanonicalUtcTimestamp(organization.createdAt, 'organization.createdAt'),
      assertCanonicalUtcTimestamp(organization.updatedAt, 'organization.updatedAt'),
    )
  }

  findById(id: string): Organization | undefined {
    const row = this.database.get<OrganizationRow>(
      `SELECT id, nome, ativo, criado_em, atualizado_em
       FROM organizacoes WHERE id = ?`,
      id,
    )
    return row ? mapOrganization(row) : undefined
  }
}

export class SqliteCompanyRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(company: Company): void {
    this.database.run(
      `INSERT INTO empresas (
         id, organizacao_id, razao_social, nome_fantasia, cnpj, uf,
         ativo, inativada_em, criado_em, atualizado_em
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      requiredText(company.id, 'company.id'),
      requiredText(company.organizationId, 'company.organizationId'),
      requiredText(company.legalName, 'company.legalName'),
      optionalText(company.tradeName) ?? null,
      normalizeCnpj(company.cnpj),
      normalizeBrazilianState(company.state),
      company.active ? 1 : 0,
      company.inactivatedAt
        ? assertCanonicalUtcTimestamp(company.inactivatedAt, 'company.inactivatedAt')
        : null,
      assertCanonicalUtcTimestamp(company.createdAt, 'company.createdAt'),
      assertCanonicalUtcTimestamp(company.updatedAt, 'company.updatedAt'),
    )
  }

  findById(id: string): Company | undefined {
    const row = this.database.get<CompanyRow>(
      `SELECT id, organizacao_id, razao_social, nome_fantasia, cnpj, uf,
              ativo, inativada_em, criado_em, atualizado_em
       FROM empresas WHERE id = ?`,
      id,
    )
    return row ? mapCompany(row) : undefined
  }

  findByCnpj(organizationId: string, cnpj: string): Company | undefined {
    const row = this.database.get<CompanyRow>(
      `SELECT id, organizacao_id, razao_social, nome_fantasia, cnpj, uf,
              ativo, inativada_em, criado_em, atualizado_em
       FROM empresas WHERE organizacao_id = ? AND cnpj = ?`,
      organizationId,
      normalizeCnpj(cnpj),
    )
    return row ? mapCompany(row) : undefined
  }

  inactivate(id: string, inactivatedAt: string): void {
    const timestamp = assertCanonicalUtcTimestamp(inactivatedAt, 'inactivatedAt')
    this.database.run(
      `UPDATE empresas
       SET ativo = 0, inativada_em = ?, atualizado_em = ?
       WHERE id = ? AND ativo = 1`,
      timestamp,
      timestamp,
      id,
    )
  }
}

export class SqliteBatchRepository {
  constructor(private readonly database: SqliteDatabase) {}

  createWithOccurrences(
    batch: Omit<FiscalBatchRecord, 'totalFiles' | 'totalDocuments' | 'totalPendencies'>,
    occurrences: readonly FileOccurrenceRecord[],
  ): void {
    const ordered = [...occurrences].sort(
      (left, right) =>
        left.order - right.order || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    )
    if (ordered.some(({ batchId }) => batchId !== batch.id)) {
      throw new Error('Todas as ocorrências devem pertencer ao lote criado.')
    }

    this.database.transaction(() => {
      this.database.run(
        `INSERT INTO lotes (
           id, organizacao_id, empresa_id, nome_original, recebido_em, status,
           ultimo_cancelamento_em, total_arquivos, total_notas, total_pendencias,
           criado_em, atualizado_em
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
        requiredText(batch.id, 'batch.id'),
        requiredText(batch.organizationId, 'batch.organizationId'),
        optionalText(batch.companyId) ?? null,
        optionalText(batch.originalName) ?? null,
        assertCanonicalUtcTimestamp(batch.receivedAt, 'batch.receivedAt'),
        batch.status,
        batch.lastCanceledAt
          ? assertCanonicalUtcTimestamp(batch.lastCanceledAt, 'batch.lastCanceledAt')
          : null,
        ordered.length,
        assertCanonicalUtcTimestamp(batch.createdAt, 'batch.createdAt'),
        assertCanonicalUtcTimestamp(batch.updatedAt, 'batch.updatedAt'),
      )

      for (const occurrence of ordered) this.insertOccurrence(occurrence)
    })
  }

  findById(id: string): FiscalBatchRecord | undefined {
    const row = this.database.get<BatchRow>(
      `SELECT id, organizacao_id, empresa_id, nome_original, recebido_em, status,
              ultimo_cancelamento_em,
              total_arquivos, total_notas, total_pendencias, criado_em, atualizado_em
       FROM lotes WHERE id = ?`,
      id,
    )
    return row ? mapBatch(row) : undefined
  }

  cancel(id: string, canceledAt: string): void {
    const timestamp = assertCanonicalUtcTimestamp(canceledAt, 'canceledAt')
    this.database.run(
      `UPDATE lotes
       SET status = 'CANCELADO', ultimo_cancelamento_em = ?, atualizado_em = ?
       WHERE id = ? AND status IN ('VALIDANDO', 'PROCESSANDO', 'INTERROMPIDO')`,
      timestamp,
      timestamp,
      requiredText(id, 'batch.id'),
    )
    const changes = this.database.get<{ changes: number | bigint }>('SELECT changes() AS changes')
    if (Number(changes?.changes ?? 0) !== 1) {
      throw new Error('Lote inexistente ou em estado que não permite cancelamento.')
    }
  }

  resume(id: string, resumedAt: string): void {
    const timestamp = assertCanonicalUtcTimestamp(resumedAt, 'resumedAt')
    this.database.run(
      `UPDATE lotes
       SET status = 'PROCESSANDO', atualizado_em = ?
       WHERE id = ? AND status IN ('CANCELADO', 'INTERROMPIDO')`,
      timestamp,
      requiredText(id, 'batch.id'),
    )
    const changes = this.database.get<{ changes: number | bigint }>('SELECT changes() AS changes')
    if (Number(changes?.changes ?? 0) !== 1) {
      throw new Error('Lote inexistente ou em estado que não permite retomada.')
    }
  }

  listOccurrences(batchId: string): readonly FileOccurrenceRecord[] {
    return this.database
      .all<OccurrenceRow>(
        `SELECT id, lote_id, nome_original, caminho_relativo, tipo_detectado, origem,
                nome_container, hash_conteudo, tamanho_bytes, ordem_no_envio,
                chave_acesso, status_ingestao, repeticao, conflito_conteudo,
                ocorrencia_original_id, elegivel_totais_ocorrencia, recebido_em
         FROM ocorrencias_arquivo
         WHERE lote_id = ?
         ORDER BY ordem_no_envio, id`,
        batchId,
      )
      .map(mapOccurrence)
  }

  private insertOccurrence(occurrence: FileOccurrenceRecord): void {
    if (!Number.isSafeInteger(occurrence.sizeBytes) || occurrence.sizeBytes < 0) {
      throw new Error('occurrence.sizeBytes deve ser um inteiro não negativo.')
    }
    if (!Number.isSafeInteger(occurrence.order) || occurrence.order < 1) {
      throw new Error('occurrence.order deve ser um inteiro positivo.')
    }
    const accessKey = optionalText(occurrence.accessKey)
    if (accessKey && !/^\d{44}$/.test(accessKey)) {
      throw new Error('occurrence.accessKey deve possuir 44 dígitos.')
    }

    this.database.run(
      `INSERT INTO ocorrencias_arquivo (
         id, lote_id, nome_original, caminho_relativo, tipo_detectado, origem,
         nome_container, hash_conteudo, tamanho_bytes, ordem_no_envio,
         chave_acesso, status_ingestao, repeticao, conflito_conteudo,
         ocorrencia_original_id, elegivel_totais_ocorrencia, recebido_em
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      requiredText(occurrence.id, 'occurrence.id'),
      requiredText(occurrence.batchId, 'occurrence.batchId'),
      requiredText(occurrence.originalName, 'occurrence.originalName'),
      requiredText(occurrence.relativePath, 'occurrence.relativePath'),
      occurrence.detectedKind,
      occurrence.origin,
      optionalText(occurrence.containerName) ?? null,
      normalizedHash(occurrence.contentHash),
      occurrence.sizeBytes,
      occurrence.order,
      accessKey ?? null,
      occurrence.ingestionStatus,
      occurrence.repetition,
      occurrence.contentConflict,
      optionalText(occurrence.originalOccurrenceId) ?? null,
      occurrence.eligibleForTotalsByOccurrencePolicy ? 1 : 0,
      assertCanonicalUtcTimestamp(occurrence.receivedAt, 'occurrence.receivedAt'),
    )
  }
}
