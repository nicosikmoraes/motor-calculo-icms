import type { RuleConditions } from './rule-selector'

export interface RuleConditionField {
  key: keyof RuleConditions
  label: string
  options?: readonly (readonly [string, string])[]
  pattern?: string
  hint: string
}
const states = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')
const codes = (values: readonly string[]): readonly (readonly [string, string])[] => values.map((value) => [value, value])
/** Contrato de igualdade exata compartilhado pelo formulário e pelo processo principal. */
export const RULE_CONDITION_FIELDS: readonly RuleConditionField[] = [
  { key: 'operationType', label: 'Direção da operação', options: [['0', 'Entrada'], ['1', 'Saída']], hint: 'Direção informada na nota.' },
  ...(['companyId', 'supplierProductId', 'fiscalProfileId'] as const).map((key, index) => ({ key,
    label: ['ID da empresa', 'ID do produto vinculado', 'ID do perfil'][index]!, hint: 'Identificador do cadastro local.', pattern: '^.{1,200}$' })),
  { key: 'originState', label: 'UF de origem', options: codes(states), hint: 'UF do emitente.' },
  { key: 'destinationState', label: 'UF de destino', options: codes([...states, 'EX']), hint: 'UF do destinatário.' },
  { key: 'ncm', label: 'NCM', pattern: '^(?:[0-9]{8}|00)$', hint: 'Oito dígitos ou 00; preserve zeros à esquerda.' },
  { key: 'cest', label: 'CEST', pattern: '^[0-9]{7}$', hint: 'Sete dígitos, sem pontuação.' },
  { key: 'cfop', label: 'CFOP', pattern: '^[123567][0-9]{3}$', hint: 'Quatro dígitos, sem pontuação.' },
  { key: 'issuerRegime', label: 'CRT', options: codes(['1', '2', '3', '4']), hint: 'Código do regime do emitente.' },
  { key: 'cst', label: 'CST', options: codes(['00', '02', '10', '15', '20', '30', '40', '41', '50', '51', '53', '60', '61', '70', '90']), hint: 'Código CST de ICMS, com dois dígitos.' },
  { key: 'finalConsumer', label: 'Consumidor final', options: [['0', 'Não'], ['1', 'Sim']], hint: 'Indicador da nota.' },
  { key: 'purpose', label: 'Finalidade', options: [['1', 'Normal'], ['2', 'Complementar'], ['3', 'Ajuste'], ['4', 'Devolução']], hint: 'Finalidade da nota.' },
  { key: 'merchandiseOrigin', label: 'Origem da mercadoria', options: codes(['0', '1', '2', '3', '4', '5', '6', '7', '8']), hint: 'Código de origem do item.' },
]

/** Valida formato e vocabulário; não homologa classificação ou resultado fiscal. */
export function normalizeRuleConditions(input: unknown): RuleConditions {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Condições inválidas.')
  const result: RuleConditions = {}
  for (const [key, raw] of Object.entries(input)) {
    const field = RULE_CONDITION_FIELDS.find((item) => item.key === key)
    if (!field || typeof raw !== 'string') throw new Error('Condição desconhecida ou inválida.')
    const value = raw.trim()
    if (!value || (field.options && !field.options.some(([code]) => code === value))
      || (field.pattern && !new RegExp(field.pattern).test(value))) {
      throw new Error(`Valor inválido para ${field.label}. ${field.hint}`)
    }
    result[field.key] = value
  }
  return result
}
