import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { CORE_MIGRATIONS, SqliteBatchRepository, SqliteCompanyRepository, SqliteDatabase, SqliteOrganizationRepository, runSqlMigrations } from '@motor/database'
import type { NormalizedNfe, NormalizedNfeItem } from '@motor/domain'
import type { ItemFiscalAnswers } from '@motor/contracts'
import { paranaStMvaCandidates } from '@motor/tax-engine'
import { buildItemFiscalContext, validateItemFiscalAnswers } from '../src/main/item-fiscal-use-cases'
import { getItemFiscalContext, saveItemFiscalAnswers } from '../src/main/item-fiscal-use-cases'
import { getBatchConsolidation } from '../src/main/batch-consolidation'

const source = { format: 'NFE_XML_4_00' as const, xmlPath: 'NFe' }
const buyer = '11222333000181'
const item: NormalizedNfeItem = { itemNumber: '1', cfop: '6102', ncm: '33059000', cest: '2002000', productAmount: '100',
  declaredIcms: { cst: '00', originCode: '0', rate: '12', amount: '12' }, source }
const nfe: NormalizedNfe = { kind: 'NFE', layoutVersion: '4.00', model: '55', accessKey: '1'.repeat(44), number: '1', series: '1',
  issuedAt: '2026-08-18T12:00:00-03:00', operationDirection: '1', purposeCode: '1', finalConsumerIndicator: '0', environmentCode: '1',
  issuer: { state: 'SC', taxRegimeCode: '3', taxId: '11444777000161', taxIdType: 'CNPJ' },
  recipient: { state: 'PR', taxId: buyer, taxIdType: 'CNPJ', stateRegistrationIndicator: '1' }, items: [item], declaredTotals: {}, source }
const answers: ItemFiscalAnswers = { entryMethod: 'ICMS_ST', stApplicableConfirmed: true, stBuyerLiabilityConfirmed: true,
  stMvaFallbackConfirmed: true, stInternalRate: '23', stMvaMode: 'CATALOG_INTERSTATE', fcpStApplicableConfirmed: true, stInternalRateIncludesFcp: false }
const context = (a: ItemFiscalAnswers = answers, i: NormalizedNfeItem = item, d: NormalizedNfe = nfe) =>
  buildItemFiscalContext(d, i, a, undefined, undefined, undefined, buyer)

describe('pendências de enquadramento de entradas', () => {
  it('pede o tratamento da entrada antes do FCP-ST, inclusive no Simples sem destaque', () => {
    expect(context({}).calculation.reason).toContain('Escolha o tratamento')
    const simple = context({}, { ...item, declaredIcms: { csosn: '102' } }, { ...nfe, issuer: { ...nfe.issuer, taxRegimeCode: '1' } })
    expect(simple.calculation.reason).toContain('CSOSN 102')
    expect(simple.calculation.reason).toContain('Escolha o tratamento')
    expect(simple.calculation.result).toBeUndefined()
  })
  it('prioriza a classificação e a MVA ausentes; só pede FCP quando os dados anteriores estão completos', () => {
    const { fcpStApplicableConfirmed: _fcp, ...withoutFcp } = answers
    expect(context({ ...withoutFcp, stMvaMode: 'MANUAL_APPLIED' }, { ...item, cest: '2805600' }).calculation.reason).toContain('Revise a classificação')
    expect(context(withoutFcp).calculation.reason).toContain('incidência ou não incidência de FCP-ST')
    const { stApplicableConfirmed: _st, ...withoutSt } = withoutFcp
    expect(context(withoutSt).calculation.reason).toContain('Confirme primeiro')
  })
  it('persiste ST/FCP do Simples e os inclui na consolidação sem liberar consumidor final', () => {
    const db=new SqliteDatabase(':memory:')
    try {
      runSqlMigrations(db,CORE_MIGRATIONS,{appVersion:'test'})
      const organizationId=randomUUID(),companyId=randomUUID(),batchId=randomUUID(),documentId=randomUUID(),occurrenceId=randomUUID()
      const time='2026-10-18T12:00:00.000Z'
      new SqliteOrganizationRepository(db).create({id:organizationId,name:'Teste',active:true,createdAt:time,updatedAt:time})
      new SqliteCompanyRepository(db).create({id:companyId,organizationId,legalName:'Compradora',cnpj:buyer,state:'PR',active:true,createdAt:time,updatedAt:time})
      const simple={...nfe,issuer:{...nfe.issuer,taxRegimeCode:'1'},items:[{...item,declaredIcms:{originCode:'0',csosn:'101'}}]}
      new SqliteBatchRepository(db).createWithOccurrences({id:batchId,organizationId,companyId,status:'CONCLUIDO',receivedAt:time,createdAt:time,updatedAt:time},[
        {id:occurrenceId,batchId,originalName:'teste.xml',relativePath:'teste.xml',detectedKind:'XML',origin:'SELECTED_FILE',contentHash:'a'.repeat(64),sizeBytes:1,order:1,
          accessKey:nfe.accessKey,ingestionStatus:'PROCESSADA',repetition:'ORIGINAL',contentConflict:'SEM_CONFLITO',eligibleForTotalsByOccurrencePolicy:true,receivedAt:time},
      ],[],[{id:documentId,batchId,companyId,occurrenceId,contentHash:'a'.repeat(64),eligibleForProcessing:true,createdAt:time,normalized:simple}])
      const saved=saveItemFiscalAnswers(db,{batchId,documentId,itemNumber:'1',requestId:randomUUID(),answers:{...answers,stMvaMode:'CATALOG_ORIGINAL',stSimpleDeductionConfirmed:true}})
      expect(saved.calculation.result?.amount).toBe('22.88')
      expect(getItemFiscalContext(db,batchId,documentId,'1').calculation.reviewReason).toBeUndefined()
      const consolidated=getBatchConsolidation(db,batchId)
      expect(consolidated.evidence.find(e=>e.component==='ICMS_ST')).toMatchObject({status:'CALCULATED',calculatedIcms:'22.88'})
      expect(consolidated.evidence.find(e=>e.component==='FCP_ST')).toMatchObject({status:'CALCULATED',calculatedIcms:'3.03'})
    } finally {db.close()}
  })
  it('ajusta MVA de origem nacional a 12% e separa o FECOP na entrada', () => {
    const memory = context().calculation
    expect(memory.status).toBe('CALCULATED')
    expect(memory.result?.amount).toBe('28.93')
    expect(memory.additionalComponents?.[0]?.result?.amount).toBe('3.56')
    expect(memory.inputs.find(i => i.name === 'mvaMode')?.value).toBe('ADJUSTED_INTERSTATE')
    expect(context({ ...answers, stMvaMode: 'CATALOG_ORIGINAL' }).calculation.status).toBe('PENDING_DATA')
  })
  it('não presume obrigação do adquirente nem ausência de preço que prevaleça sobre MVA', () => {
    expect(context({ ...answers, stBuyerLiabilityConfirmed: false }).calculation.reason).toContain('responsabilidade')
    expect(context({ ...answers, stMvaFallbackConfirmed: false }).calculation.reason).toContain('preço')
  })
  it('consulta candidatos por NCM sem confirmar CEST nem escolher entre máscaras, condicionadores e tinturas', () => {
    const missing = { ...item, cest: '2805600' }
    const candidates = paranaStMvaCandidates('2026-08-18', missing.ncm)
    expect(candidates.map(row => row.cest)).toEqual(['2002000','2002100','2002200'])
    const row = candidates[0]!
    const selected = { ...answers, stCatalogRowId: row.id }
    expect(context(selected, missing).calculation.status).toBe('PENDING_DATA')
    const reviewed = context({ ...selected, stClassificationConfirmed: true, stClassificationReason: 'Máscara capilar: descrição e ficha do produto conferidas.' }, missing)
    expect(reviewed.calculation.status).toBe('CALCULATED')
    const evidence = JSON.parse(reviewed.calculation.inputs.find(i => i.name === 'reviewedClassification')!.value)
    expect(evidence).toMatchObject({ originalNcm: '33059000', originalCest: '2805600', reviewedCest: '2002000', confirmed: true })
    expect(missing.cest).toBe('2805600')
    expect(context({ ...selected, stClassificationConfirmed: true, stClassificationReason: 'x', stCatalogRowId: 'unknown' }, missing).calculation.status).toBe('PENDING_DATA')
    expect(paranaStMvaCandidates('2026-02-30', missing.ncm)).toEqual([])
  })
  it('cobre remetente do Simples nacional sem usar o crédito permitido na dedução', () => {
    const simpleNfe = { ...nfe, issuer: { ...nfe.issuer, taxRegimeCode: '1' } }
    const simpleItem = { ...item, declaredIcms: { originCode: '0', csosn: '101', creditRate: '1.5', creditAmount: '1.50' } }
    const a = { ...answers, stMvaMode: 'CATALOG_ORIGINAL' as const, stSimpleDeductionConfirmed: true }
    const memory = context(a, simpleItem, simpleNfe).calculation
    expect(memory.status).toBe('CALCULATED')
    expect(memory.result?.amount).toBe('22.88')
    expect(memory.steps.find(s => s.name === 'ICMS próprio da operação')?.result).toBe('12')
    expect(context({ ...a, stSimpleDeductionConfirmed: false }, simpleItem, simpleNfe).calculation.status).toBe('PENDING_DATA')
    expect(context({ ...a, stMvaMode: 'CATALOG_INTERSTATE' }, simpleItem, simpleNfe).calculation.status).toBe('PENDING_DATA')
  })
  it('adota a premissa de revenda e mantém os conflitos documentais fora do total definitivo', () => {
    const conflict=context(answers, item, { ...nfe, finalConsumerIndicator: '1' })
    expect(conflict.answers.destination).toBeUndefined()
    expect(conflict.answers.destinationBasis).toBeUndefined()
    expect(conflict.calculation.status).toBe('PENDING_DATA')
    expect(conflict.calculation.reason).toContain('consumidor final')
    expect(conflict.calculation.result).toBeUndefined()
    expect(context(answers, { ...item, cfop: '6911' }).blockedReason).toContain('amostra')
    const rate = context({ entryMethod: 'RATE_DIFFERENCE', entryApplicationConfirmed: true, entryBaseConfirmed: true, entryInternalRate: '12' }, { ...item, cfop: '6911' })
    expect(rate.blockedReason).toContain('Amostra')
  })
  it('valida as decisões revisadas na fronteira da aplicação', () => {
    expect(() => validateItemFiscalAnswers({ stCatalogRowId: '../invalid value' })).toThrow()
    expect(() => validateItemFiscalAnswers({ stClassificationReason: ' ' })).toThrow()
    expect(() => validateItemFiscalAnswers({ stBuyerLiabilityConfirmed: 'true' })).toThrow()
    expect(validateItemFiscalAnswers({ stMvaMode: 'CATALOG_INTERSTATE', stClassificationReason: '  fundamento  ' })).toEqual({ stMvaMode: 'CATALOG_INTERSTATE', stClassificationReason: 'fundamento' })
  })
})
