import { AppError, AppErrorCode } from '@motor/domain'
import { randomUUID } from 'node:crypto'
import type { ItemRuleAssessment, RuleAssessmentRunSummary } from '@motor/contracts'
import {
  assertCanonicalUtcTimestamp,
  BatchStatusCode,
  normalizeBrazilianState,
  normalizeCnpj,
  type BatchStatus,
  type Company,
  type FiscalEnvironmentCode,
  type Organization,
  type NormalizedNfe,
} from '@motor/domain'
import type { SqliteDatabase } from './sqlite-database'

/** Valores persistidos nas ocorrências; enums evitam códigos divergentes entre fluxos. */
export enum IngestionStatusCode {
  INVENTARIADA = 'INVENTARIADA', PROCESSADA = 'PROCESSADA', PENDENTE = 'PENDENTE',
  REJEITADA = 'REJEITADA', IGNORADA = 'IGNORADA',
}
export type StoredIngestionStatus = `${IngestionStatusCode}`
export enum RepetitionCode {
  NAO_CLASSIFICADA = 'NAO_CLASSIFICADA', ORIGINAL = 'ORIGINAL',
  REPETIDA = 'REPETIDA', NAO_CLASSIFICAVEL = 'NAO_CLASSIFICAVEL',
}
export type StoredRepetition = `${RepetitionCode}`
export enum ContentConflictCode {
  NAO_CLASSIFICADO = 'NAO_CLASSIFICADO', SEM_CONFLITO = 'SEM_CONFLITO',
  CONFLITO_CONTEUDO = 'CONFLITO_CONTEUDO', NAO_CLASSIFICAVEL = 'NAO_CLASSIFICAVEL',
}
export type StoredContentConflict = `${ContentConflictCode}`
export enum FileKindCode { XML = 'XML', ZIP = 'ZIP', UNKNOWN = 'UNKNOWN' }
export type StoredFileKind = `${FileKindCode}`
export enum FileOriginCode {
  SELECTED_FILE = 'SELECTED_FILE', FOLDER_FILE = 'FOLDER_FILE', ZIP_ENTRY = 'ZIP_ENTRY',
}
export type StoredFileOrigin = `${FileOriginCode}`

export interface FiscalBatchRecord {
  id: string
  organizationId: string
  companyId?: string
  originalName?: string
  receivedAt: string
  status: BatchStatus
  environmentCode?: FiscalEnvironmentCode
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

export interface IngestionDiagnosticRecord {
  id: string
  batchId: string
  occurrenceId?: string
  source: string
  code: string
  message: string
  createdAt: string
}

export interface NormalizedFiscalDocumentRecord {
  id: string
  batchId: string
  companyId?: string
  occurrenceId: string
  contentHash: string
  normalized: NormalizedNfe
  ruleAssessments?: Readonly<Record<string, ItemRuleAssessment>>
  eligibleForProcessing: boolean
  pendingReason?: string
  createdAt: string
}

interface OrganizationRow extends Record<string, unknown> {
  id: string
  revisao: number
  nome: string
  ativo: number
  criado_em: string
  atualizado_em: string
}

interface CompanyRow extends Record<string, unknown> {
  id: string
  revisao: number
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
  ambiente: FiscalEnvironmentCode | null
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
  if (!normalized) throw new AppError(AppErrorCode.REQUIRED_FIELD, { field })
  return normalized
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function normalizedHash(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new AppError(AppErrorCode.INVALID_CONTENT_HASH)
  }
  return normalized
}

function mapOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    revision: row.revisao,
    name: row.nome,
    active: row.ativo === 1,
    createdAt: row.criado_em,
    updatedAt: row.atualizado_em,
  }
}

function mapCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    revision: row.revisao,
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
    ...(row.ambiente ? { environmentCode: row.ambiente } : {}),
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
      `SELECT id, nome, ativo, criado_em, atualizado_em, revisao
       FROM organizacoes WHERE id = ?`,
      id,
    )
    return row ? mapOrganization(row) : undefined
  }

  findSingle(): Organization | undefined {
    const rows = this.database.all<OrganizationRow>(
      `SELECT id, nome, ativo, criado_em, atualizado_em, revisao
       FROM organizacoes
       ORDER BY criado_em, id
       LIMIT 2`,
    )
    if (rows.length > 1) {
      throw new AppError(AppErrorCode.MULTIPLE_ORGANIZATIONS)
    }
    return rows[0] ? mapOrganization(rows[0]) : undefined
  }

  createSingle(organization: Organization): void {
    const existing = this.database.get<{ total: number | bigint }>(
      'SELECT count(*) AS total FROM organizacoes',
    )
    if (Number(existing?.total ?? 0) !== 0) {
      throw new AppError(AppErrorCode.ORGANIZATION_ALREADY_CONFIGURED)
    }
    this.create(organization)
  }

  rename(id: string, name: string, updatedAt: string, expectedRevision?: number): void {
    this.database.run(
      `UPDATE organizacoes SET nome = ?, atualizado_em = ?, revisao = revisao + 1
       WHERE id = ? AND (? IS NULL OR revisao = ?)`,
      requiredText(name, 'organization.name'),
      assertCanonicalUtcTimestamp(updatedAt, 'organization.updatedAt'),
      requiredText(id, 'organization.id'),
      expectedRevision ?? null, expectedRevision ?? null,
    )
    const changes = this.database.get<{ changes: number | bigint }>('SELECT changes() AS changes')
    if (Number(changes?.changes ?? 0) !== 1) {
      throw new AppError(expectedRevision === undefined ? AppErrorCode.ORGANIZATION_NOT_FOUND : AppErrorCode.REGISTRATION_REVISION_CONFLICT)
    }
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
              ativo, inativada_em, criado_em, atualizado_em, revisao
       FROM empresas WHERE id = ?`,
      id,
    )
    return row ? mapCompany(row) : undefined
  }

  findByCnpj(organizationId: string, cnpj: string): Company | undefined {
    const row = this.database.get<CompanyRow>(
      `SELECT id, organizacao_id, razao_social, nome_fantasia, cnpj, uf,
              ativo, inativada_em, criado_em, atualizado_em, revisao
       FROM empresas WHERE organizacao_id = ? AND cnpj = ?`,
      organizationId,
      normalizeCnpj(cnpj),
    )
    return row ? mapCompany(row) : undefined
  }

  listByOrganization(organizationId: string): readonly Company[] {
    return this.database
      .all<CompanyRow>(
        `SELECT id, organizacao_id, razao_social, nome_fantasia, cnpj, uf,
                ativo, inativada_em, criado_em, atualizado_em, revisao
         FROM empresas
         WHERE organizacao_id = ?
         ORDER BY razao_social COLLATE NOCASE, id`,
        requiredText(organizationId, 'organizationId'),
      )
      .map(mapCompany)
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
    diagnostics: readonly IngestionDiagnosticRecord[] = [],
    documents: readonly NormalizedFiscalDocumentRecord[] = [],
  ): void {
    const ordered = [...occurrences].sort(
      (left, right) =>
        left.order - right.order || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    )
    if (ordered.some(({ batchId }) => batchId !== batch.id)) {
      throw new AppError(AppErrorCode.OCCURRENCE_BATCH_MISMATCH)
    }
    if (diagnostics.some(({ batchId }) => batchId !== batch.id)) {
      throw new AppError(AppErrorCode.DIAGNOSTIC_BATCH_MISMATCH)
    }
    if (documents.some(({ batchId }) => batchId !== batch.id)) {
      throw new AppError(AppErrorCode.DOCUMENT_BATCH_MISMATCH)
    }
    const totalDocuments = ordered.filter(({ accessKey }) => accessKey !== undefined).length

    this.database.transaction(() => {
      this.database.run(
        `INSERT INTO lotes (
           id, organizacao_id, empresa_id, nome_original, recebido_em, status,
           ambiente, ultimo_cancelamento_em, total_arquivos, total_notas,
           total_pendencias, criado_em, atualizado_em
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        requiredText(batch.id, 'batch.id'),
        requiredText(batch.organizationId, 'batch.organizationId'),
        optionalText(batch.companyId) ?? null,
        optionalText(batch.originalName) ?? null,
        assertCanonicalUtcTimestamp(batch.receivedAt, 'batch.receivedAt'),
        batch.status,
        batch.environmentCode ?? null,
        batch.lastCanceledAt
          ? assertCanonicalUtcTimestamp(batch.lastCanceledAt, 'batch.lastCanceledAt')
          : null,
        ordered.length,
        totalDocuments,
        diagnostics.length,
        assertCanonicalUtcTimestamp(batch.createdAt, 'batch.createdAt'),
        assertCanonicalUtcTimestamp(batch.updatedAt, 'batch.updatedAt'),
      )

      for (const occurrence of ordered) this.insertOccurrence(occurrence)
      for (const diagnostic of diagnostics) {
        this.database.run(
          `INSERT INTO diagnosticos_ingestao (
             id, lote_id, ocorrencia_id, origem, codigo, mensagem, criado_em
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          requiredText(diagnostic.id, 'diagnostic.id'),
          requiredText(diagnostic.batchId, 'diagnostic.batchId'),
          optionalText(diagnostic.occurrenceId) ?? null,
          requiredText(diagnostic.source, 'diagnostic.source'),
          requiredText(diagnostic.code, 'diagnostic.code'),
          requiredText(diagnostic.message, 'diagnostic.message'),
          assertCanonicalUtcTimestamp(diagnostic.createdAt, 'diagnostic.createdAt'),
        )
      }
      for (const document of documents) this.insertNormalizedDocument(document)
    })
  }

  findById(id: string): FiscalBatchRecord | undefined {
    const row = this.database.get<BatchRow>(
      `SELECT id, organizacao_id, empresa_id, nome_original, recebido_em, status,
              ambiente, ultimo_cancelamento_em,
              total_arquivos, total_notas, total_pendencias, criado_em, atualizado_em
       FROM lotes WHERE id = ?`,
      id,
    )
    return row ? mapBatch(row) : undefined
  }

  listByOrganization(organizationId: string): readonly FiscalBatchRecord[] {
    return this.database.all<BatchRow>(
      `SELECT id, organizacao_id, empresa_id, nome_original, recebido_em, status,
              ambiente, ultimo_cancelamento_em, total_arquivos, total_notas,
              total_pendencias, criado_em, atualizado_em
       FROM lotes WHERE organizacao_id = ?
       ORDER BY recebido_em DESC, id DESC`,
      requiredText(organizationId, 'organizationId'),
    ).map(mapBatch)
  }

  cancel(id: string, canceledAt: string): void {
    const timestamp = assertCanonicalUtcTimestamp(canceledAt, 'canceledAt')
    this.database.run(
      `UPDATE lotes
       SET status = ?, ultimo_cancelamento_em = ?, atualizado_em = ?
       WHERE id = ? AND status IN ('VALIDANDO', 'PROCESSANDO', 'INTERROMPIDO')`,
      BatchStatusCode.CANCELADO,
      timestamp,
      timestamp,
      requiredText(id, 'batch.id'),
    )
    const changes = this.database.get<{ changes: number | bigint }>('SELECT changes() AS changes')
    if (Number(changes?.changes ?? 0) !== 1) {
      throw new AppError(AppErrorCode.BATCH_CANNOT_CANCEL)
    }
  }

  resume(id: string, resumedAt: string): void {
    const timestamp = assertCanonicalUtcTimestamp(resumedAt, 'resumedAt')
    this.database.run(
      `UPDATE lotes
       SET status = ?, atualizado_em = ?
       WHERE id = ? AND status IN ('CANCELADO', 'INTERROMPIDO')`,
      BatchStatusCode.PROCESSANDO,
      timestamp,
      requiredText(id, 'batch.id'),
    )
    const changes = this.database.get<{ changes: number | bigint }>('SELECT changes() AS changes')
    if (Number(changes?.changes ?? 0) !== 1) {
      throw new AppError(AppErrorCode.BATCH_CANNOT_RESUME)
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

  listDiagnostics(batchId: string): readonly IngestionDiagnosticRecord[] {
    return this.database.all<{
      id: string; lote_id: string; ocorrencia_id: string | null; origem: string;
      codigo: string; mensagem: string; criado_em: string
    }>(
      `SELECT id, lote_id, ocorrencia_id, origem, codigo, mensagem, criado_em
       FROM diagnosticos_ingestao WHERE lote_id = ? ORDER BY criado_em, id`,
      batchId,
    ).map((row) => ({
      id: row.id,
      batchId: row.lote_id,
      ...(row.ocorrencia_id ? { occurrenceId: row.ocorrencia_id } : {}),
      source: row.origem,
      code: row.codigo,
      message: row.mensagem,
      createdAt: row.criado_em,
    }))
  }

  countCompaniesByBatch(batchId: string): number {
    return this.database.get<{ total: number }>(
      'SELECT COUNT(DISTINCT empresa_id) AS total FROM documentos_fiscais WHERE lote_id = ?',
      batchId,
    )?.total ?? 0
  }

  listNormalizedDocuments(batchId: string): readonly NormalizedFiscalDocumentRecord[] {
    return this.database.all<{
      id: string; lote_id: string; ocorrencia_arquivo_id: string; hash_xml: string;
      dados_normalizados_json: string; elegivel_processamento: number;
      motivo_exclusao_pendencia: string | null; criado_em: string; empresa_id: string | null
    }>(
      `SELECT id, lote_id, ocorrencia_arquivo_id, hash_xml, dados_normalizados_json,
              elegivel_processamento, motivo_exclusao_pendencia, criado_em, empresa_id
       FROM documentos_fiscais WHERE lote_id = ? ORDER BY chave_acesso, id`,
      batchId,
    ).map((row) => ({
      id: row.id,
      batchId: row.lote_id,
      occurrenceId: row.ocorrencia_arquivo_id,
      ruleAssessments: this.readRuleAssessments(row.id),
      ...(row.empresa_id ? { companyId: row.empresa_id } : {}),
      contentHash: row.hash_xml,
      normalized: JSON.parse(row.dados_normalizados_json) as NormalizedNfe,
      eligibleForProcessing: row.elegivel_processamento === 1,
      ...(row.motivo_exclusao_pendencia
        ? { pendingReason: row.motivo_exclusao_pendencia }
        : {}),
      createdAt: row.criado_em,
    }))
  }

  /** Registra uma execução completa sem modificar a avaliação da importação ou execuções anteriores. */
  createRuleAssessmentRun(
    batchId: string,
    packId: string,
    packVersion: number,
    assessedAt: string,
    assessments: readonly { documentId: string; itemNumber: string; assessment: ItemRuleAssessment }[],
  ): RuleAssessmentRunSummary {
    if (!Number.isSafeInteger(packVersion) || packVersion < 1) throw new AppError(AppErrorCode.INVALID_PACK_VERSION)
    const timestamp = assertCanonicalUtcTimestamp(assessedAt, 'assessedAt')
    const id = randomUUID()
    return this.database.transaction(() => {
      if (!this.findById(batchId)) throw new AppError(AppErrorCode.BATCH_RECORD_NOT_FOUND)
      const items = this.database.all<{ id: string; documento_id: string; numero_item: string }>(
        `SELECT i.id, i.documento_id, i.numero_item FROM itens_documento i
         JOIN documentos_fiscais d ON d.id = i.documento_id
         WHERE d.lote_id = ? ORDER BY d.id, i.numero_item`, batchId,
      )
      if (items.length === 0) throw new AppError(AppErrorCode.BATCH_NO_ITEMS)
      const byKey = new Map(items.map((item) => [JSON.stringify([item.documento_id, item.numero_item]), item.id]))
      const submitted = new Set<string>()
      if (assessments.length !== items.length) throw new AppError(AppErrorCode.ASSESSMENT_INCOMPLETE)
      for (const { documentId, itemNumber, assessment } of assessments) {
        const key = JSON.stringify([documentId, itemNumber])
        if (!byKey.has(key) || submitted.has(key)) throw new AppError(AppErrorCode.ASSESSMENT_ITEM_INVALID)
        if (assessment.packId !== packId || assessment.packVersion !== packVersion || assessment.assessedAt !== timestamp) {
          throw new AppError(AppErrorCode.ASSESSMENT_RUN_MISMATCH)
        }
        submitted.add(key)
      }
      const previous = this.database.get<{ number: number }>(
        'SELECT COALESCE(MAX(numero_execucao), 0) AS number FROM execucoes_avaliacao_regras WHERE lote_id = ?', batchId,
      )
      const number = (previous?.number ?? 0) + 1
      this.database.run(
        `INSERT INTO execucoes_avaliacao_regras
         (id, lote_id, numero_execucao, pacote_id, pacote_versao, avaliada_em)
         VALUES (?, ?, ?, ?, ?, ?)`,
        id, batchId, number, requiredText(packId, 'packId'), packVersion, timestamp,
      )
      for (const { documentId, itemNumber, assessment } of assessments) {
        this.database.run(
          `INSERT INTO avaliacoes_regras_itens (execucao_id, item_id, avaliacao_json)
           VALUES (?, ?, ?)`,
          id, byKey.get(JSON.stringify([documentId, itemNumber]))!, JSON.stringify(assessment),
        )
      }
      return { id, number, packId, packVersion, assessedAt: timestamp, itemCount: items.length }
    })
  }

  listRuleAssessmentRuns(batchId: string): readonly RuleAssessmentRunSummary[] {
    return this.database.all<{
      id: string; numero_execucao: number; pacote_id: string; pacote_versao: number;
      avaliada_em: string; total_itens: number
    }>(
      `SELECT e.id, e.numero_execucao, e.pacote_id, e.pacote_versao, e.avaliada_em,
              COUNT(a.item_id) AS total_itens
       FROM execucoes_avaliacao_regras e
       LEFT JOIN avaliacoes_regras_itens a ON a.execucao_id = e.id
       WHERE e.lote_id = ?
       GROUP BY e.id ORDER BY e.numero_execucao`, batchId,
    ).map((row) => ({
      id: row.id, number: row.numero_execucao, packId: row.pacote_id,
      packVersion: row.pacote_versao, assessedAt: row.avaliada_em, itemCount: row.total_itens,
    }))
  }

  readRuleAssessmentsForRun(batchId: string, runId: string): ReadonlyMap<string, Readonly<Record<string, ItemRuleAssessment>>> {
    const run = this.database.get<{ id: string }>(
      'SELECT id FROM execucoes_avaliacao_regras WHERE id = ? AND lote_id = ?', runId, batchId,
    )
    if (!run) throw new AppError(AppErrorCode.ASSESSMENT_RUN_NOT_FOUND)
    const rows = this.database.all<{
      documento_id: string; numero_item: string; avaliacao_json: string
    }>(
      `SELECT i.documento_id, i.numero_item, a.avaliacao_json
       FROM avaliacoes_regras_itens a JOIN itens_documento i ON i.id = a.item_id
       WHERE a.execucao_id = ? ORDER BY i.documento_id, i.numero_item`, runId,
    )
    const byDocument = new Map<string, Record<string, ItemRuleAssessment>>()
    for (const row of rows) {
      const values = byDocument.get(row.documento_id) ?? Object.create(null) as Record<string, ItemRuleAssessment>
      values[row.numero_item] = JSON.parse(row.avaliacao_json) as ItemRuleAssessment
      byDocument.set(row.documento_id, values)
    }
    return byDocument
  }

  private readRuleAssessments(documentId: string): Readonly<Record<string, ItemRuleAssessment>> {
    const rows = this.database.all<{ numero_item: string; avaliacao_regras_json: string | null }>(
      `SELECT numero_item, avaliacao_regras_json FROM itens_documento
       WHERE documento_id = ? ORDER BY numero_item`,
      documentId,
    )
    return Object.fromEntries(rows.filter((row) => row.avaliacao_regras_json !== null)
      .map((row) => [row.numero_item, JSON.parse(row.avaliacao_regras_json!) as ItemRuleAssessment]))
  }

  private insertNormalizedDocument(document: NormalizedFiscalDocumentRecord): void {
    const normalized = document.normalized
    this.database.run(
      `INSERT INTO documentos_fiscais (
         id, lote_id, ocorrencia_arquivo_id, chave_acesso, modelo, numero, serie,
         emissao_original, emitente_cnpj, destinatario_cnpj_cpf, uf_origem, uf_destino,
         ambiente, finalidade, hash_xml, dados_normalizados_json,
         elegivel_processamento, motivo_exclusao_pendencia, criado_em, empresa_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      requiredText(document.id, 'document.id'),
      requiredText(document.batchId, 'document.batchId'),
      requiredText(document.occurrenceId, 'document.occurrenceId'),
      requiredText(normalized.accessKey, 'document.accessKey'),
      normalized.model,
      requiredText(normalized.number, 'document.number'),
      requiredText(normalized.series, 'document.series'),
      normalized.issuedAt ?? null,
      normalized.issuer.taxIdType === 'CNPJ' ? normalized.issuer.taxId ?? null : null,
      normalized.recipient?.taxId ?? null,
      normalized.issuer.state ?? null,
      normalized.recipient?.state ?? null,
      normalized.environmentCode ?? null,
      normalized.purposeCode ?? null,
      normalizedHash(document.contentHash),
      JSON.stringify(normalized),
      document.eligibleForProcessing ? 1 : 0,
      document.pendingReason ?? (document.eligibleForProcessing ? null : 'AGUARDANDO_CALCULO'),
      assertCanonicalUtcTimestamp(document.createdAt, 'document.createdAt'),
      document.companyId ?? null,
    )
    for (const item of normalized.items) {
      this.database.run(
        `INSERT INTO itens_documento (
           id, documento_id, numero_item, codigo_produto_fornecedor,
           descricao, ncm, cest, cfop, dados_normalizados_json, avaliacao_regras_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        document.id,
        requiredText(item.itemNumber, 'item.itemNumber'),
        item.supplierProductCode ?? null,
        item.description ?? null,
        item.ncm ?? null,
        item.cest ?? null,
        item.cfop ?? null,
        JSON.stringify(item),
        document.ruleAssessments?.[item.itemNumber]
          ? JSON.stringify(document.ruleAssessments[item.itemNumber]) : null,
      )
    }
  }

  private insertOccurrence(occurrence: FileOccurrenceRecord): void {
    if (!Number.isSafeInteger(occurrence.sizeBytes) || occurrence.sizeBytes < 0) {
      throw new AppError(AppErrorCode.INVALID_OCCURRENCE_SIZE)
    }
    if (!Number.isSafeInteger(occurrence.order) || occurrence.order < 1) {
      throw new AppError(AppErrorCode.INVALID_STORED_OCCURRENCE_ORDER)
    }
    const accessKey = optionalText(occurrence.accessKey)
    if (accessKey && !/^\d{44}$/.test(accessKey)) {
      throw new AppError(AppErrorCode.INVALID_ACCESS_KEY)
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
