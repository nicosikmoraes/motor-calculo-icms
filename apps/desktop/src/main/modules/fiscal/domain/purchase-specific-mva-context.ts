import type { ItemFiscalAnswers, ItemFiscalQuestion } from '@motor/contracts'
import type { NormalizedNfe, NormalizedNfeItem, NormalizedParty } from '@motor/domain'
import { selectParanaSpecificStMva, specificStSector } from '@motor/tax-engine'

const yesNo = [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]
export function preparePurchaseSpecificMva(nfe: NormalizedNfe, item: NormalizedNfeItem, answers: ItemFiscalAnswers, supplier: NormalizedParty) {
  const sector = specificStSector(item.ncm, item.cest, item.fuelAnpCode)
  if (!sector) return undefined
  const tax = item.declaredIcms
  const selected = selectParanaSpecificStMva({
    ...(nfe.issuedAt ? { operationDate: nfe.issuedAt.slice(0,10) } : {}), ...(item.ncm ? { ncm: item.ncm } : {}), ...(item.cest ? { cest: item.cest } : {}),
    ...(supplier.state ? { issuerState: supplier.state } : {}), recipientState: 'PR',
    ...(supplier.taxRegimeCode || answers.stSupplierNormalConfirmed !== undefined ? { supplierRegime: supplier.taxRegimeCode ?? (answers.stSupplierNormalConfirmed ? '3' : 'NOT_NORMAL') } : {}),
    ...(tax?.originCode ? { merchandiseOrigin: tax.originCode } : {}), ...(tax?.cst ? { cst: tax.cst } : {}),
    ...(tax?.stBaseMode !== undefined ? { stBaseMode: tax.stBaseMode } : {}),
    ...(tax?.amount !== undefined ? { ownIcmsAmount: tax.amount } : {}),
    ...(item.fuelAnpCode !== undefined ? { fuelAnpCode: item.fuelAnpCode } : {}),
    ...(item.vehicleOperationType !== undefined ? { vehicleOperationType: item.vehicleOperationType } : {}),
    monophaseFieldsPresent: [tax?.monophaseAmount, tax?.monophaseRetainedAmount, tax?.monophasePreviouslyRetainedAmount].some(value => value !== undefined),
    ...(answers.stSpecificRuleConfirmed !== undefined ? { ruleConditionsConfirmed: answers.stSpecificRuleConfirmed } : {}),
    ...(answers.stFuelCategory ? { fuelCategory: answers.stFuelCategory } : {}),
    ...(answers.stFuelArt50OperationBaseConfirmed !== undefined ? { fuelArt50OperationBaseConfirmed: answers.stFuelArt50OperationBaseConfirmed } : {}),
    ...(answers.stFuelMonophaseConfirmed !== undefined ? { fuelMonophaseConfirmed: answers.stFuelMonophaseConfirmed } : {}),
    ...(answers.stVehicleNewForResaleConfirmed !== undefined ? { vehicleNewForResaleConfirmed: answers.stVehicleNewForResaleConfirmed } : {}),
    ...(answers.stVehicleMvaFallbackConfirmed !== undefined ? { vehicleMvaFallbackConfirmed: answers.stVehicleMvaFallbackConfirmed } : {}),
    ...(answers.stVehicleImportedConfirmed !== undefined ? { vehicleImportedConfirmed: answers.stVehicleImportedConfirmed } : {}),
    ...(answers.stVehicleImportPriceFloorConfirmed !== undefined ? { vehicleImportPriceFloorConfirmed: answers.stVehicleImportPriceFloorConfirmed } : {}),
    ...(answers.stSpecificEffectiveRate !== undefined ? { effectiveInternalRate: answers.stSpecificEffectiveRate } : {}),
    ...((answers.stOwnOperationRate ?? tax?.rate) !== undefined ? { ownOperationRate: answers.stOwnOperationRate ?? tax?.rate! } : {}),
  })!
  const decision = { ...selected, inputs: selected.inputs.map(entry => entry.name === 'ownIcmsAmount'
    || (entry.name === 'ownOperationRate' && answers.stOwnOperationRate === undefined) ? { ...entry, source: 'XML/item' }
    : entry.name === 'supplierRegime' && supplier.taxRegimeCode === undefined ? { ...entry, source: 'DERIVED/USER_SUPPLIER_REGIME' }
    : entry.name === 'monophaseFieldsPresent' ? { ...entry, source: 'DERIVED/XML_ICMS' } : entry) }
  const questions: ItemFiscalQuestion[] = [
    { field: 'stSpecificRuleConfirmed', label: `Confirma incidência, descrição e vigência da regra de ${sector === 'FUEL' ? 'combustíveis/lubrificantes (art. 11)' : 'veículos novos (art. 29)'} para esta operação, com todos os encargos e acessórios incluídos?`, options: yesNo },
    ...(supplier.state !== 'PR' ? [{ field: 'stSpecificEffectiveRate' as const, label: 'Carga interna efetiva para ajustar a MVA (%) — considere a redução de base e inclua o FECOP quando incidente.', inputType: 'decimal' as const }] : []),
    ...(sector === 'FUEL' ? [
      { field: 'stFuelMonophaseConfirmed' as const, label: 'Este combustível está sujeito ao ICMS monofásico nesta data? Confira a classificação ANP e a legislação vigente.', options: yesNo },
      { field: 'stFuelArt50OperationBaseConfirmed' as const, label: 'Confirma a hipótese do art. 50 pelo valor da operação: sem PMPF/COTEPE, preço final do art. 47 ou preço fixado para o substituto? Se houver algum desses preços, a base exige outro tratamento.', options: yesNo },
      { field: 'stFuelCategory' as const, label: 'Qual categoria do art. 11 corresponde à descrição legal deste produto?', options: [
        { value: 'PETROLEUM_NONINCIDENCE', label: 'Derivado de petróleo com não incidência interestadual' },
        { value: 'SHALE_OIL', label: 'Óleo combustível derivado de xisto' }, { value: 'OTHER', label: 'Demais produtos abrangidos pelo artigo' },
      ] },
    ] : [
      { field: 'stVehicleNewForResaleConfirmed' as const, label: 'É veículo novo para revenda, sem industrialização, remessa com retorno ou faturamento direto ao consumidor?', options: yesNo },
      { field: 'stVehicleMvaFallbackConfirmed' as const, label: item.ncm?.startsWith('8711')
        ? 'É veículo de duas rodas sem os preços previstos no art. 136, § 3º, permitindo usar a MVA do § 4º?'
        : 'Confirma a hipótese do art. 136, II: operação fora do inciso I (montadora/concessionária interestadual com tabela) e ausência do preço máximo/único legal?', options: yesNo },
      { field: 'stVehicleImportedConfirmed' as const, label: 'O veículo acabado é importado? Diferencie da presença de componentes importados em veículo nacional.', options: yesNo },
      { field: 'stVehicleImportPriceFloorConfirmed' as const, label: 'O preço da operação do veículo importado atende ao piso das bases de II/IPI previsto no art. 136, § 1º?', options: yesNo },
    ]),
  ]
  return { sector, decision, questions }
}
