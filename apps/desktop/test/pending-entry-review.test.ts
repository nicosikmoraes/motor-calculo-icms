import {afterEach,beforeEach,describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {normalizeNfeXml} from '@motor/nfe-parser'
import {CORE_MIGRATIONS,SqliteDatabase,SqliteOrganizationRepository,SqliteCompanyRepository,SqliteBatchRepository,SqliteCalculationRepository,runSqlMigrations} from '@motor/database'
import {PARANA_ST_MVA_CATALOG} from '@motor/tax-engine'
import type {ItemFiscalAnswers} from '@motor/contracts'
import {applyAutomaticXmlCalculations,getItemFiscalContext,saveItemFiscalAnswers,buildItemFiscalContext} from '../src/main/item-fiscal-use-cases'
import {buildConsumerDifalContext} from '../src/main/consumer-difal-context'
import {calculateAutomaticItem} from '../src/main/automatic-xml-calculation'
import {getBatchConsolidation} from '../src/main/batch-consolidation'
const original=normalizeNfeXml(readFileSync(new URL('./fixtures/revisao-interestadual-1245.xml',import.meta.url),'utf8'))
const time='2026-09-15T15:00:00.000Z',batchId='00000000-0000-4000-8000-000000000101',companyId='00000000-0000-4000-8000-000000000102'
const buyer=original.recipient!.taxId!
function product(itemNumber:string,description:string,amount:string,ncm='33041000',cest:string|undefined='2800900') {
 return {...original.items[0]!,itemNumber,description,cfop:'6102',ncm,cest,productAmount:amount,declaredIcms:{group:'ICMS00',cst:'00',baseMode:'3',originCode:'0',baseAmount:amount,rate:'12',amount:String(Number(amount)*0.12)}}
}
const notes=[{...original,number:'100',accessKey:'1'.repeat(44),declaredTotals:{},items:[product('1','GLOSS LABIAL MEL 4ML','100.00'),product('2','GLOSS LABIAL MORANGO 4ML','200.00'),product('3','GOLA HIG DESC','30.00','48189090',undefined)]},
 {...original,number:'101',accessKey:'2'.repeat(44),declaredTotals:{},items:[product('1','GLOSS LABIAL TUTTIFRUTI 4ML','50.00'),product('2','CURVADOR DE CILIOS','15.00','82032090','0800800')]}]
const reviewed:ItemFiscalAnswers={entryMethod:'ICMS_ST',stCatalogRowId:PARANA_ST_MVA_CATALOG.rows.find(r=>r.cest==='2000900')!.id,stClassificationConfirmed:true,stClassificationReason:'Produto sintético para revenda convencional, descrição de maquiagem para os lábios conferida.',stApplicableConfirmed:true,stBuyerLiabilityConfirmed:true,stMvaFallbackConfirmed:true,stMvaMode:'CATALOG_INTERSTATE',stInternalRate:'23',stOwnOperationRate:'12',fcpStApplicableConfirmed:true,stInternalRateIncludesFcp:false}
let db:SqliteDatabase
beforeEach(()=>{
 db=new SqliteDatabase(':memory:');runSqlMigrations(db,CORE_MIGRATIONS,{appVersion:'test'})
 new SqliteOrganizationRepository(db).create({id:'00000000-0000-4000-8000-000000000103',name:'Teste',active:true,createdAt:time,updatedAt:time})
 new SqliteCompanyRepository(db).create({id:companyId,organizationId:'00000000-0000-4000-8000-000000000103',legalName:'Compradora',cnpj:buyer,state:'PR',active:true,createdAt:time,updatedAt:time})
 new SqliteBatchRepository(db).createWithOccurrences({id:batchId,organizationId:'00000000-0000-4000-8000-000000000103',status:'RECEBIDO',receivedAt:time,createdAt:time,updatedAt:time},notes.map((n,i)=>({id:'00000000-0000-4000-8000-00000000010'+(6+i),batchId,originalName:'nota'+i+'.xml',relativePath:'nota'+i+'.xml',detectedKind:'XML' as const,origin:'SELECTED_FILE' as const,contentHash:String(i+1).repeat(64),sizeBytes:1,order:i+1,accessKey:n.accessKey,ingestionStatus:'PROCESSADA' as const,repetition:'ORIGINAL' as const,contentConflict:'SEM_CONFLITO' as const,eligibleForTotalsByOccurrencePolicy:true,receivedAt:time})),[],notes.map((n,i)=>({id:'00000000-0000-4000-8000-00000000010'+(4+i),batchId,companyId,occurrenceId:'00000000-0000-4000-8000-00000000010'+(6+i),contentHash:String(i+1).repeat(64),eligibleForProcessing:true,createdAt:time,normalized:n})))
 applyAutomaticXmlCalculations(db,batchId)
})
afterEach(()=>db.close())
describe('pendências de entradas interestaduais',()=>{
 it('confirma uma classificação e calcula equivalentes em duas notas, com valores próprios e idempotência',()=>{
  const before=getItemFiscalContext(db,batchId,'00000000-0000-4000-8000-000000000104','1')
  expect(before.stMvaCandidates?.find(r=>r.suggested)?.cest).toBe('2000900')
  expect(before.matchingBatchItems).toHaveLength(3)
  const input={batchId,documentId:'00000000-0000-4000-8000-000000000104',itemNumber:'1',requestId:'classify-batch',expectedRunId:before.runId!,reuseScope:'MATCHING_BATCH_ITEMS' as const,answers:reviewed}
  const saved=saveItemFiscalAnswers(db,input)
  expect(saved.appliedBatchItems).toBe(3)
  expect([['00000000-0000-4000-8000-000000000104','1'],['00000000-0000-4000-8000-000000000104','2'],['00000000-0000-4000-8000-000000000105','1']].map(([d,i])=>getItemFiscalContext(db,batchId,d!,i!).calculation.result?.amount)).toEqual(['33.56','67.12','16.78'])
  expect(saveItemFiscalAnswers(db,input).runId).toBe(saved.runId)
  expect(getItemFiscalContext(db,batchId,'00000000-0000-4000-8000-000000000104','3').answers.stCatalogRowId).toBeUndefined()
  expect(getItemFiscalContext(db,batchId,'00000000-0000-4000-8000-000000000105','2').answers.stCatalogRowId).toBeUndefined()
  expect(new SqliteBatchRepository(db).listNormalizedDocuments(batchId)[0]!.normalized.items[0]!.cest).toBe('2800900')
  expect(getBatchConsolidation(db,batchId).counts.calculated).toBe(3)
 })
 it('preserva revisão individual anterior, mesmo pendente',()=>{
  const c=getItemFiscalContext(db,batchId,'00000000-0000-4000-8000-000000000105','1')
  saveItemFiscalAnswers(db,{batchId,documentId:'00000000-0000-4000-8000-000000000105',itemNumber:'1',requestId:'individual',expectedRunId:c.runId!,answers:{stApplicableConfirmed:false}})
  expect(getItemFiscalContext(db,batchId,'00000000-0000-4000-8000-000000000104','1').matchingBatchItems).toHaveLength(2)
 })
 it('reverte todas as gravações se uma nota do conjunto for inválida',()=>{
  const repository=new SqliteCalculationRepository(db),latest=repository.latestByDocument('00000000-0000-4000-8000-000000000104')!
  const run={requestId:'atomic-invalid',batchId,documentId:'00000000-0000-4000-8000-000000000104',previousRunId:latest.id,engineVersion:'test',items:latest.items}
  expect(()=>repository.saveMany([run,{...run,documentId:'missing'}])).toThrow()
  expect(repository.findByRequest('atomic-invalid','00000000-0000-4000-8000-000000000104')).toBeUndefined()
  expect(repository.latestByDocument('00000000-0000-4000-8000-000000000104')?.id).toBe(latest.id)
 })
 it('encaminha o CFOP 6403 com ST declarada para conferência, sem estimar nova retenção',()=>{
  const item={...product('1','TESOURA','100.00','82130000','0801800'),cfop:'6403',declaredIcms:{group:'ICMS10',cst:'10',originCode:'0',baseMode:'3',baseAmount:'100.00',rate:'12',amount:'12.00',stBaseMode:'4',stMarginPercent:'50',stBaseAmount:'150.00',stRate:'19.5',stAmount:'17.25'}}
  const memory=calculateAutomaticItem({...notes[0]!,items:[item]},item,buyer)!
  expect(memory.result?.amount).toBe('17.25')
  expect(memory.inputs.some(i=>i.name==='calculationPurpose' && i.value==='INTERSTATE_ENTRY_ST_ESTIMATE')).toBe(false)
 })
 it('não classifica curvador de cílios como pinça de sobrancelha só pelo NCM',()=>{
  expect(getItemFiscalContext(db,batchId,'00000000-0000-4000-8000-000000000105','2').stMvaCandidates?.some(r=>r.suggested)).toBe(false)
 })
 it('calcula DIFAL com bases distintas após confirmar uso e parâmetros',()=>{
  const item={...product('1','CAFETEIRA','100.00','85167100','2104800'),declaredIcms:{group:'ICMS00',cst:'00',baseMode:'3',baseAmount:'100.00',originCode:'2',rate:'4',amount:'4.00'}}
  const nfe={...notes[0]!,finalConsumerIndicator:'1',items:[item]}
  const answers:ItemFiscalAnswers={entryMethod:'CONSUMER_DIFAL',destination:'OWN_USE',destinationBasis:'CONFIRMED',entryApplicationConfirmed:true,entryBaseConfirmed:true,entryBaseAmount:'100.00',entryInternalRate:'19.5',entryInterstateRate:'4'}
  const c=buildConsumerDifalContext(nfe,item,answers,buyer)
  expect(c.calculation.status,c.calculation.reason).toBe('CALCULATED')
  expect(c.calculation.result).toMatchObject({component:'ICMS_ENTRY',base:'119.25',amount:'19.25'})
  expect(buildConsumerDifalContext(nfe,item,{...answers,entryBaseConfirmed:false},buyer).calculation.result).toBeUndefined()
  expect(buildConsumerDifalContext(nfe,{...item,declaredIcms:{...item.declaredIcms,stAmount:'1'}},answers,buyer).calculation.reason).toContain('ST')
  expect(buildItemFiscalContext(nfe,item,{},undefined,undefined,undefined,buyer).answers.destination).toBeUndefined()
 })
 it('exige fundamento para adotar revenda quando o XML indica consumidor final',()=>{
  const nfe={...notes[0]!,finalConsumerIndicator:'1'}
  const item=product('1','GLOSS LABIAL MEL','100.00')
  expect(buildItemFiscalContext(nfe,item,reviewed,undefined,undefined,undefined,buyer).calculation.result).toBeUndefined()
  expect(buildItemFiscalContext(nfe,item,{...reviewed,destination:'RESALE',destinationBasis:'CONFIRMED',destinationReviewReason:'Destinação e evidência de revenda conferidas no exemplo sintético.'},undefined,undefined,undefined,buyer).calculation.status).toBe('CALCULATED')
 })
})
