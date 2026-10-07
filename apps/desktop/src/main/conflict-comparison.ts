import type { ConflictComparisonField } from '@motor/contracts'
import type { NormalizedFiscalDocumentRecord } from '@motor/database'
const labels: Record<string, string> = {
  model: 'Modelo', layoutVersion: 'Leiaute', number: 'Número', series: 'Série', issuedAt: 'Emissão', operationNature: 'Natureza da operação',
  operationDirection: 'Entrada / saída', destinationIndicator: 'Destino da operação', purposeCode: 'Finalidade', environmentCode: 'Ambiente',
  finalConsumerIndicator: 'Consumidor final', presenceIndicator: 'Presença do comprador', taxId: 'CNPJ / CPF', taxIdType: 'Tipo de identificação',
  name: 'Nome', stateRegistration: 'Inscrição estadual', stateRegistrationIndicator: 'Contribuinte', state: 'UF', taxRegimeCode: 'Regime tributário',
  itemNumber: 'Número do item', supplierProductCode: 'Código do produto', description: 'Descrição', ncm: 'NCM', cest: 'CEST', cfop: 'CFOP',
  commercialUnit: 'Unidade comercial', commercialQuantity: 'Quantidade comercial', commercialUnitAmount: 'Valor unitário comercial', productAmount: 'Valor dos produtos',
  tributaryUnit: 'Unidade tributável', tributaryQuantity: 'Quantidade tributável', tributaryUnitAmount: 'Valor unitário tributável',
  freightAmount: 'Frete', insuranceAmount: 'Seguro', discountAmount: 'Desconto', otherAmount: 'Outras despesas', ipiAmount: 'IPI',
  includedInDocumentTotal: 'Participa do total', group: 'Grupo de ICMS', originCode: 'Origem', cst: 'CST', csosn: 'CSOSN',
  baseMode: 'Modalidade da base', baseReductionPercent: 'Redução da base', baseAmount: 'Base', rate: 'Alíquota', amount: 'Valor',
  stBaseMode: 'Modalidade da base ST', stMarginPercent: 'MVA', stBaseReductionPercent: 'Redução da base ST', stBaseAmount: 'Base ST', stRate: 'Alíquota ST', stAmount: 'ICMS-ST',
  fcpRate: 'Alíquota FCP', fcpAmount: 'FCP', fcpStRate: 'Alíquota FCP-ST', fcpStAmount: 'FCP-ST',
  destinationBaseAmount: 'Base destino', destinationFcpRate: 'Alíquota FCP destino', destinationFcpAmount: 'FCP destino', interstateRate: 'Alíquota interestadual',
  destinationInternalRate: 'Alíquota interna destino', destinationSharePercent: 'Partilha destino', destinationAmount: 'ICMS destino', originAmount: 'ICMS origem',
  icmsBaseAmount: 'Base ICMS', icmsAmount: 'ICMS', icmsExemptAmount: 'ICMS desonerado', importTaxAmount: 'Imposto de importação',
  returnedIpiAmount: 'IPI devolvido', pisAmount: 'PIS', cofinsAmount: 'COFINS', documentAmount: 'Valor da nota',
}
function label(path: string): string {
  const parts = path.split('.'), field = labels[parts.at(-1)!] ?? parts.at(-1)!
  const prefix = parts[0] === 'items' ? `Item ${parts[1]}${parts.includes('declaredIcms') ? ' · ICMS' : ''}`
    : ({ issuer: 'Emitente', recipient: 'Destinatário', declaredTotals: 'Totais do XML' } as Record<string, string>)[parts[0]!] ?? 'Nota'
  return `${prefix} · ${field}`
}
/** Itens são alinhados pelo número fiscal, nunca pela posição do array. Ausente difere de vazio e de zero. */
export function compareConflictDocuments(documents: readonly NormalizedFiscalDocumentRecord[]): readonly ConflictComparisonField[] {
  const maps = documents.map(document => {
    const fields = new Map<string, string>()
    function flatten(value: unknown, prefix = ''): void {
      if (value === undefined || value === null) return
      if (typeof value !== 'object') { fields.set(prefix, String(value)); return }
      if (Array.isArray(value)) { for (const item of value) flatten(item, `${prefix}.${item.itemNumber}`); return }
      for (const [field, entry] of Object.entries(value)) if (!['source', 'kind', 'accessKey'].includes(field)) flatten(entry, prefix ? `${prefix}.${field}` : field)
    }
    flatten(document.normalized)
    return fields
  })
  return [...new Set(maps.flatMap(map => [...map.keys()]))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
    .map(path => { const values = maps.map(map => map.get(path) ?? null)
      return { path, label: label(path), values, different: new Set(values).size > 1 } })
}
