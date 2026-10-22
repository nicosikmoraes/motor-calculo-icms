import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CORE_MIGRATIONS, SqliteBatchRepository, SqliteCalculationRepository, SqliteCompanyRepository, SqliteDatabase, SqliteOrganizationRepository, runSqlMigrations } from '@motor/database'
import { applyAutomaticXmlCalculations, getItemFiscalContext, saveItemFiscalAnswers, validateItemFiscalAnswers } from '../src/main/item-fiscal-use-cases'
import { getBatchConsolidation } from '../src/main/batch-consolidation'
import { buildItemFiscalContext } from '../src/main/item-fiscal-use-cases'
import type { NormalizedNfe } from '@motor/domain'

let db:SqliteDatabase, batchId:string,documentId:string,companyId:string,nfe:NormalizedNfe
const now='2026-10-18T12:00:00.000Z'
const answers={entryMethod:'RATE_DIFFERENCE' as const,entryApplicationConfirmed:true,entryBaseConfirmed:true,entryInternalRate:'12'}
beforeEach(()=>{
  db=new SqliteDatabase(':memory:');runSqlMigrations(db,CORE_MIGRATIONS,{appVersion:'test'})
  const org=randomUUID(),occurrence=randomUUID();batchId=randomUUID();documentId=randomUUID();companyId=randomUUID()
  new SqliteOrganizationRepository(db).create({id:org,name:'Escritório',active:true,createdAt:now,updatedAt:now})
  new SqliteCompanyRepository(db).create({id:companyId,organizationId:org,legalName:'Compradora',cnpj:'11222333000181',state:'PR',active:true,createdAt:now,updatedAt:now})
  const source={format:'NFE_XML_4_00' as const,xmlPath:'NFe.infNFe'}
  nfe={kind:'NFE',layoutVersion:'4.00',model:'55',accessKey:'1'.repeat(44),number:'1',series:'1',issuedAt:'2026-08-18T12:00:00-03:00',environmentCode:'1',operationDirection:'1',purposeCode:'1',finalConsumerIndicator:'0',
    issuer:{taxId:'11444777000161',taxIdType:'CNPJ',state:'SP',taxRegimeCode:'3'},recipient:{taxId:'11222333000181',taxIdType:'CNPJ',state:'PR',stateRegistrationIndicator:'1'},
    declaredTotals:{},source,items:[{itemNumber:'1',cfop:'6102',ncm:'85163200',productAmount:'2299.86',discountAmount:'115.00',declaredIcms:{cst:'00',baseMode:'3',originCode:'2',baseAmount:'2184.86',rate:'4',amount:'87.39'},source}]}
  new SqliteBatchRepository(db).createWithOccurrences({id:batchId,organizationId:org,companyId,status:'CONCLUIDO',receivedAt:now,createdAt:now,updatedAt:now},[
    {id:occurrence,batchId,originalName:'nota.xml',relativePath:'nota.xml',detectedKind:'XML',origin:'SELECTED_FILE',contentHash:'a'.repeat(64),sizeBytes:1,order:1,accessKey:nfe.accessKey,
      ingestionStatus:'PROCESSADA',repetition:'ORIGINAL',contentConflict:'SEM_CONFLITO',eligibleForTotalsByOccurrencePolicy:true,receivedAt:now},
  ],[],[{id:documentId,batchId,companyId,occurrenceId:occurrence,contentHash:'a'.repeat(64),eligibleForProcessing:true,createdAt:now,normalized:nfe}])
})
afterEach(()=>db.close())
describe('revisão da antecipação do adquirente',()=>{
  it('adota revenda por premissa, conserva escolhas explícitas e não confirma os tributos automaticamente',()=>{
    const context=getItemFiscalContext(db,batchId,documentId,'1')
    expect(context.answers).toMatchObject({destination:'RESALE',destinationBasis:'ASSUMED_RESALE'})
    expect(context.destinationAssumption).toContain('presumida')
    expect(context.answers.stApplicableConfirmed).toBeUndefined()
    expect(context.answers.entryApplicationConfirmed).toBeUndefined()
    const explicit=buildItemFiscalContext(nfe,nfe.items[0]!,{destination:'OWN_USE'},undefined,undefined,undefined,nfe.recipient!.taxId)
    expect(explicit.answers.destination).toBe('OWN_USE')
    expect(explicit.destinationAssumption).toBeUndefined()
    const seller=buildItemFiscalContext(nfe,nfe.items[0]!,{},undefined,undefined,undefined,nfe.issuer.taxId)
    expect(seller.answers.destination).toBeUndefined()
    expect(()=>validateItemFiscalAnswers({destination:'OWN_USE',destinationBasis:'ASSUMED_RESALE'})).toThrow()
  })
  it('salva e reabre a premissa com rastreabilidade e permite repetir a mesma solicitação',()=>{
    const request={batchId,documentId,itemNumber:'1',requestId:randomUUID(),answers:{entryMethod:'RATE_DIFFERENCE' as const}}
    const saved=saveItemFiscalAnswers(db,request)
    expect(saved.calculation.status).toBe('PENDING_DATA')
    expect(saved.calculation.inputs.some(i=>i.name==='destinationAssumption' && i.source==='USER_POLICY/DEFAULT_RESALE')).toBe(true)
    expect(saveItemFiscalAnswers(db,request).runId).toBe(saved.runId)
    const reopened=getItemFiscalContext(db,batchId,documentId,'1')
    expect(reopened.answers.destinationBasis).toBe('ASSUMED_RESALE')
    expect(reopened.destinationAssumption).toContain('orientação do usuário')
  })
  it('persiste a obrigação separada e preserva o cálculo próprio anterior no histórico',()=>{
    const previous=saveItemFiscalAnswers(db,{batchId,documentId,itemNumber:'1',requestId:randomUUID(),calculationMode:'XML',answers:{}})
    expect(previous.calculation.result?.amount).toBe('87.39')
    const current=saveItemFiscalAnswers(db,{batchId,documentId,itemNumber:'1',requestId:randomUUID(),expectedRunId:previous.runId!,answers})
    expect(current.calculation.result).toMatchObject({component:'ICMS_ENTRY',amount:'174.79'})
    expect(current.answers).toEqual({...answers,destination:'RESALE',destinationBasis:'ASSUMED_RESALE'})
    expect(current.calculation.inputs.find(i=>i.name==='destinationAssumption')?.source).toBe('USER_POLICY/DEFAULT_RESALE')
    expect(current.calculation.comparisons).toBeUndefined()
    expect(getBatchConsolidation(db,batchId).evidence[0]).toMatchObject({component:'ICMS_ENTRY',calculatedIcms:'174.79'})
    expect(applyAutomaticXmlCalculations(db,batchId)).toBe(0)
    expect(new SqliteCalculationRepository(db).latestByDocument(documentId)?.previousRunId).toBe(previous.runId)
    expect(db.get('SELECT count(*) AS n FROM execucoes_calculo')?.n).toBe(2)
  })
  it('adota base legal revisada por item, preserva vBC do XML e rastreia a origem ao reabrir',()=>{
    const revised={...answers,entryBaseAmount:'2299.86'}
    const saved=saveItemFiscalAnswers(db,{batchId,documentId,itemNumber:'1',requestId:randomUUID(),answers:revised})
    expect(saved.calculation.result).toMatchObject({component:'ICMS_ENTRY',base:'2299.86',amount:'183.99'})
    expect(saved.calculation.inputs.find(i=>i.name==='baseAmount')).toMatchObject({value:'2299.86',source:'USER/current_item'})
    expect(saved.calculation.inputs.find(i=>i.name==='xmlOwnBaseAmount')).toMatchObject({value:'2184.86',source:'XML/item'})
    expect(saved.calculation.inputs.find(i=>i.name==='internalRate')?.source).toBe('USER/current_item')
    const reopened=getItemFiscalContext(db,batchId,documentId,'1')
    expect(reopened.answers.entryBaseAmount).toBe('2299.86')
    expect(reopened.calculation.result?.amount).toBe('183.99')
    expect(new SqliteBatchRepository(db).listNormalizedDocuments(batchId)[0]!.normalized.items[0]!.declaredIcms?.baseAmount).toBe('2184.86')
    expect(reopened.reuseAvailable).toBe(false)
    expect(buildItemFiscalContext(nfe,nfe.items[0]!,{...revised,entryBaseConfirmed:false},undefined,undefined,undefined,nfe.recipient!.taxId).calculation.status).toBe('PENDING_DATA')
  })
  it('valida a base como valor monetário, sem limite de percentual e sem aceitar valores inválidos',()=>{
    expect(validateItemFiscalAnswers({entryBaseAmount:'10000.25'}).entryBaseAmount).toBe('10000.25')
    expect(validateItemFiscalAnswers({entryBaseAmount:'0'}).entryBaseAmount).toBe('0')
    for(const entryBaseAmount of ['-1','NaN','Infinity','1,20',100]) expect(()=>validateItemFiscalAnswers({entryBaseAmount})).toThrow()
  })
  it('salva premissas incompletas como pendência e valida os percentuais na fronteira',()=>{
    const current=saveItemFiscalAnswers(db,{batchId,documentId,itemNumber:'1',requestId:randomUUID(),answers:{entryMethod:'RATE_DIFFERENCE'}})
    expect(current.calculation.status).toBe('PENDING_DATA')
    expect(current.calculation.result).toBeUndefined()
    expect(()=>validateItemFiscalAnswers({...answers,entryInternalRate:'101'})).toThrow()
    expect(()=>validateItemFiscalAnswers({...answers,entryBaseConfirmed:'true'})).toThrow()
  })
  it('recusa atribuir a obrigação à empresa fornecedora e não duplica ST com antecipação',()=>{
    expect(buildItemFiscalContext(nfe,nfe.items[0]!,answers,undefined,undefined,undefined,nfe.issuer.taxId).blockedReason).toBeTruthy()
    expect(buildItemFiscalContext(nfe,{...nfe.items[0]!,declaredIcms:{...nfe.items[0]!.declaredIcms,stAmount:'1'}},answers,undefined,undefined,undefined,'11222333000181').blockedReason).toContain('ST')
  })
  it('registra decisão explícita de ausência de novo débito e exige fundamento',()=>{
    const pending=saveItemFiscalAnswers(db,{batchId,documentId,itemNumber:'1',requestId:randomUUID(),answers:{entryMethod:'NO_DEBIT'}})
    expect(pending.calculation.status).toBe('PENDING_DATA')
    const decision=saveItemFiscalAnswers(db,{batchId,documentId,itemNumber:'1',requestId:randomUUID(),expectedRunId:pending.runId!,answers:{entryMethod:'NO_DEBIT',entryNoDebitConfirmed:true,entryNoDebitReason:'Hipótese legal conferida no teste'}})
    expect(decision.calculation.rule).toMatchObject({id:'PR_ENTRY_NO_NEW_DEBIT',legalBasis:'Hipótese legal conferida no teste'})
    expect(decision.calculation.result?.amount).toBe('0.00')
    expect(()=>validateItemFiscalAnswers({entryNoDebitReason:' '})).toThrow()
  })
})
