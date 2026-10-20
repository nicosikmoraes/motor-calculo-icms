import { consolidationEvidenceDivergent, itemCalculationComponents, type ConsolidationEvidence, type ItemComponentCalculationSummary, type TaxComponent } from '@motor/contracts'
import type { ReportData } from './report-data'

type CellValue = string | number | undefined
export interface ItemColumn { title: string; width: number; money?: boolean }
const text = (title: string, width = 24): ItemColumn => ({ title, width })
const money = (title: string): ItemColumn => ({ title: `${title} (R$)`, width: 24, money: true })
const componentNames = { ICMS: 'ICMS', ICMS_ST: 'ICMS-ST', FCP_ST: 'FCP-ST', ICMS_ENTRY: 'Diferencial de entrada' } as const
const statusNames = { CALCULATED: 'Calculado', PENDING: 'Pendente', UNSUPPORTED: 'Fora do escopo', EXCLUDED: 'Excluído' } as const
const comparisonNames: Record<string, string> = { MATCH: 'Igual', WITHIN_TOLERANCE: 'Dentro da tolerância', DIFFERENT: 'Divergente', NOT_DECLARED: 'Não declarado', INVALID_DECLARED: 'Declarado inválido' }
const itemKey = (documentId: string, itemNumber: string) => JSON.stringify([documentId, itemNumber])

/** Uma linha por ocorrência física de produto na nota; componentes viram colunas. */
export function buildExcelItemRows(report: ReportData): { columns: ItemColumn[]; rows: CellValue[][] } {
  const documents = new Map(report.documents.map(document => [document.id, document]))
  const itemIds = new Set(report.items.map(item => itemKey(item.documentId, item.itemNumber)))
  if (itemIds.size !== report.items.length) throw new Error('Produto repetido no modelo do relatório.')
  const evidenceByItem = new Map<string, Map<TaxComponent, ConsolidationEvidence>>()
  for (const entry of report.consolidation?.evidence ?? []) {
    const key = itemKey(entry.documentId, entry.itemNumber)
    if (!itemIds.has(key) || !documents.has(entry.documentId)) throw new Error('Evidência referencia item ou documento ausente.')
    const entries = evidenceByItem.get(key) ?? new Map<TaxComponent, ConsolidationEvidence>()
    const component = entry.component ?? 'ICMS'
    if (entries.has(component)) throw new Error('Componente repetido para o mesmo produto no relatório.')
    entries.set(component, entry); evidenceByItem.set(key, entries)
  }
  const columns: ItemColumn[] = [
    text('Nota', 16), text('Série', 10), text('Item', 10), text('Código do produto', 20), text('Produto', 48),
    money('ICMS declarado'), money('ICMS calculado'), money('Diferença ICMS'), text('Situação fiscal', 24),
    money('Valor do produto'), text('NCM', 14), text('CFOP', 12),
    money('ICMS-ST declarado'), money('ICMS-ST calculado'), money('Diferença ICMS-ST'),
    money('FCP-ST declarado'), money('FCP-ST calculado'), money('Diferença FCP-ST'),
    text('Empresa', 32), text('CNPJ da empresa', 22), text('Mês de emissão', 18), text('Emissão original no XML', 30),
    text('Operação', 20), text('Ambiente', 20), text('Autorização', 38), text('Chave de acesso', 50),
    ...(report.monthly ? [text('Lote de origem', 40), text('Nome do lote', 36)] : []),
    money('ICMS diferido conhecido'), text('Componentes conferidos', 30), text('Motivo', 70),
  ]
  const componentOrder: TaxComponent[] = ['ICMS', 'ICMS_ST', 'FCP_ST', 'ICMS_ENTRY']
  for (const component of componentOrder) {
    const name = componentNames[component]
    columns.push(text(`Situação ${name}`), text(`Comparação ${name}`), money(`Base declarada ${name}`), money(`Base calculada ${name}`),
      text(`Alíquota declarada ${name} (%)`), text(`Alíquota calculada ${name} (%)`), money(`Base salva para auditoria ${name}`), money(`Imposto salvo para auditoria ${name}`),
      text(`Execução ${name}`, 40), text(`Versão do motor ${name}`), text(`Regra fiscal ${name}`, 40), text(`Versão da regra ${name}`))
  }
  columns.push(text('MVA original (%)'), text('MVA aplicada (%)'), text('Referência da MVA', 50), text('Referência FCP-ST', 50), text('Regra específica da MVA', 60), text('Antecipação exata antes do arredondamento (R$)', 32))

  const rows = report.items.map(item => {
    const document = documents.get(item.documentId)
    if (!document) throw new Error('Produto referencia documento ausente.')
    const entries = evidenceByItem.get(itemKey(item.documentId, item.itemNumber)) ?? new Map<TaxComponent, ConsolidationEvidence>()
    const allEntries = [...entries.values()]
    const memories = new Map(itemCalculationComponents(item.calculation).map(memory => [memory.component ?? memory.result?.component ?? (item.declaredIcmsStAmount !== undefined ? 'ICMS_ST' : 'ICMS'), memory] as const))
    const declared = (component: TaxComponent) => component === 'ICMS_ENTRY' ? undefined : component === 'ICMS' ? item.declaredIcmsAmount : component === 'ICMS_ST' ? item.declaredIcmsStAmount : item.declaredFcpStAmount
    const calculated = (component: TaxComponent) => entries.get(component)?.status === 'CALCULATED' ? entries.get(component)?.calculatedIcms : undefined
    const difference = (component: TaxComponent) => entries.get(component)?.status === 'CALCULATED' ? entries.get(component)?.comparison?.difference : undefined
    const anchor = allEntries[0]
    const status = !allEntries.length ? 'Sem consolidação'
      : allEntries.every(entry => entry.status === 'EXCLUDED') ? 'Excluído'
        : allEntries.some(entry => entry.status === 'UNSUPPORTED') ? 'Fora do escopo'
          : allEntries.some(entry => entry.status !== 'CALCULATED') ? 'Pendente'
            : allEntries.some(consolidationEvidenceDivergent) ? 'Divergente' : 'Calculado'
    const reasons = [...new Set(allEntries.flatMap(entry => entry.reasons.map(reason => `${componentNames[entry.component ?? 'ICMS']}: ${reason}`)))]
    const row: CellValue[] = [document.number, document.series, item.itemNumber, item.supplierProductCode, item.description,
      declared('ICMS'), calculated('ICMS'), difference('ICMS'), status, item.productAmount, item.ncm, item.cfop,
      declared('ICMS_ST'), calculated('ICMS_ST'), difference('ICMS_ST'), declared('FCP_ST'), calculated('FCP_ST'), difference('FCP_ST'),
      document.companyName, document.companyCnpj, anchor?.period, document.issuedAt,
      anchor ? ({ SALES: 'Vendas', PURCHASES: 'Compras', UNDETERMINED: 'Não identificada' } as const)[anchor.perspective] : undefined,
      document.environmentCode === '1' ? 'Produção' : document.environmentCode === '2' ? 'Homologação' : 'Não identificado',
      anchor ? anchor.authorization === 'WITH_PROTOCOL' ? 'Com protocolo associado' : 'Sem protocolo confirmado — provisório' : undefined,
      document.accessKey,
      ...(report.monthly ? [anchor?.batchId, report.monthly.batches.find(batch => batch.id === anchor?.batchId)?.name] : []),
      entries.get('ICMS')?.deferredIcms, allEntries.map(entry => componentNames[entry.component ?? 'ICMS']).join('; '), reasons.join('\n')]
    for (const component of componentOrder) {
      const entry = entries.get(component), memory = memories.get(component)
      row.push(entry ? statusNames[entry.status] : declared(component) !== undefined ? 'Não calculado' : undefined,
        entry?.comparison ? comparisonNames[entry.comparison.status] ?? entry.comparison.status : undefined,
        component === 'FCP_ST' ? item.declaredFcpStBaseAmount ?? memory?.declared?.base : memory?.declared?.base,
        entry?.status === 'CALCULATED' ? memory?.result?.base : undefined,
        component === 'FCP_ST' ? item.declaredFcpStRate ?? memory?.declared?.rate : memory?.declared?.rate,
        entry?.status === 'CALCULATED' ? memory?.result?.rate : undefined,
        memory?.result?.base, memory?.result?.amount, entry?.runId ?? memory?.runId,
        entry?.engineVersion ?? memory?.engineVersion, memory?.rule?.id, memory?.rule?.version)
    }
    const st = memories.get('ICMS_ST')
    const input = (memory: ItemComponentCalculationSummary | undefined, name: string) => memory?.inputs.find(value => value.name === name)?.value
    const specificInput = input(st, 'stSpecificMvaDecision')
    let specific: { originalMvaPercent?: string; appliedMvaPercent?: string } | undefined
    if (specificInput) {
      try { const parsed: unknown = JSON.parse(specificInput); if (parsed && typeof parsed === 'object') specific = parsed } catch { /* O texto original continua exportado para auditoria. */ }
    }
    row.push(input(st, 'originalMvaPercent') ?? specific?.originalMvaPercent,
      st?.steps.find(step => step.name === 'Base de cálculo do ICMS-ST')?.inputs.appliedMvaPercent ?? specific?.appliedMvaPercent,
      input(st, 'mvaCatalogRow'), input(memories.get('FCP_ST'), 'fcpStRule'), specificInput, entries.get('ICMS_ENTRY')?.exactCalculatedIcms)
    return row
  })
  return { columns, rows }
}
