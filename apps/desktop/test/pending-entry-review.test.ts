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
import {queryBatchDetail} from '../src/main/batch-query-handlers'
const original=normalizeNfeXml(readFileSync(new URL('./fixtures/revisao-interestadual-1245.xml',import.meta.url),'utf8'))
const time='2026-09-15T15:00:00.000Z',batchId='00000000-0000-4000-8000-000000000101',companyId='00000000-0000-4000-8000-000000000102'
const buyer=original.recipient!.taxId!
function product(itemNumber:string,description:string,amount:string,ncm='33041000',cest:string|undefined='2800900') {
 return {...original.items[0]!,itemNumber,description,cfop:'6102',ncm,cest,productAmount:amount,declaredIcms:{group:'ICMS00',cst:'00',baseMode:'3',originCode:'0',baseAmount:amount,rate:'12',amount:String(Number(amount)*0.12)}}
}
const notes=[{...original,number:'100',accessKey:'1'.repeat(44),declaredTotals:{},items:[product('1','GLOSS LABIAL MEL 4ML','100.00'),product('2','GLOSS LABIAL MORANGO 4ML','200.00'),{...product('3','GOLA HIG DESC','30.00','48189090'),cest:undefined}]},
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
 it.each(['CURRENT_ITEM','MATCHING_NOTE_ITEMS','MATCHING_BATCH_ITEMS'] as const)('não grava confirmação incompleta nem anuncia cálculo no alcance %s',reuseScope=>{
  const documentId='00000000-0000-4000-8000-000000000104'
  const repository=new SqliteCalculationRepository(db)
  const ids=['00000000-0000-4000-8000-000000000104','00000000-0000-4000-8000-000000000105']
  const before=ids.map(id=>repository.latestByDocument(id)?.id)
  const answers={...reviewed,stBuyerLiabilityConfirmed:false,fcpStApplicableConfirmed:false}
  expect(()=>saveItemFiscalAnswers(db,{batchId,documentId,itemNumber:'1',requestId:'must-calculate-'+reuseScope,expectedRunId:before[0]!,reuseScope,requireCalculated:true,answers})).toThrow(/Cálculo não concluído:.*responsabilidade.*FECOP/)
  expect(ids.map(id=>repository.latestByDocument(id)?.id)).toEqual(before)
  expect(getBatchConsolidation(db,batchId).counts.calculated).toBe(0)
 })
 it('calcula e diminui as pendências com a confirmação final válida do grupo',()=>{
  const documentId='00000000-0000-4000-8000-000000000104'
  const before=getItemFiscalContext(db,batchId,documentId,'1')
  const saved=saveItemFiscalAnswers(db,{batchId,documentId,itemNumber:'1',requestId:'require-completed-group',expectedRunId:before.runId!,reuseScope:'MATCHING_BATCH_ITEMS',requireCalculated:true,answers:reviewed})
  expect(saved.appliedBatchItems).toBe(3)
  expect(getBatchConsolidation(db,batchId).counts.calculated).toBe(3)
  const detail=queryBatchDetail(db,batchId)
  expect(detail.documents.flatMap(d=>d.items).filter(i=>i.calculation.status!=='CALCULATED')).toHaveLength(2)
 })
 it('rejeita conflito de regra mesmo com todas as confirmações principais preenchidas',()=>{
  const documentId='00000000-0000-4000-8000-000000000104',repo=new SqliteCalculationRepository(db)
  const before=repo.latestByDocument(documentId)!
  expect(()=>saveItemFiscalAnswers(db,{batchId,documentId,itemNumber:'1',requestId:'rule-conflict',expectedRunId:before.id,requireCalculated:true,answers:{...reviewed,fcpStApplicableConfirmed:false}})).toThrow(/Cálculo não concluído:.*FECOP/)
  expect(repo.latestByDocument(documentId)?.id).toBe(before.id)
  const draft=saveItemFiscalAnswers(db,{batchId,documentId,itemNumber:'1',requestId:'keep-conflicting-draft',expectedRunId:before.id,requireCalculated:false,answers:{...reviewed,fcpStApplicableConfirmed:false,purchaseReviewPending:true}})
  expect(draft.calculation.result).toBeUndefined()
 })
 it('verifica todos os itens antes de gravar o grupo, sem conclusão parcial',()=>{
  const otherId='00000000-0000-4000-8000-000000000105',sourceId='00000000-0000-4000-8000-000000000104'
  const altered=structuredClone(notes[1]!)
  altered.items[0]!.declaredIcms.amount='5000.00'
  db.run('UPDATE documentos_fiscais SET dados_normalizados_json=? WHERE id=?',JSON.stringify(altered),otherId)
  const repo=new SqliteCalculationRepository(db),before=[repo.latestByDocument(sourceId)?.id,repo.latestByDocument(otherId)?.id]
  expect(()=>saveItemFiscalAnswers(db,{batchId,documentId:sourceId,itemNumber:'1',requestId:'all-or-nothing',expectedRunId:before[0]!,reuseScope:'MATCHING_BATCH_ITEMS',requireCalculated:true,answers:reviewed})).toThrow(/Cálculo não concluído:/)
  expect([repo.latestByDocument(sourceId)?.id,repo.latestByDocument(otherId)?.id]).toEqual(before)
 })
 it('guarda informação desconhecida para revisão e não presume revenda ao reabrir',()=>{
  const documentId='00000000-0000-4000-8000-000000000104'
  const before=getItemFiscalContext(db,batchId,documentId,'1')
  const saved=saveItemFiscalAnswers(db,{batchId,documentId,itemNumber:'1',requestId:'hold-unknown-destination',expectedRunId:before.runId!,answers:{purchaseDestinationUnknown:true,purchaseReviewPending:true,purchaseReviewReason:'Falta confirmar o uso deste produto.'}})
  expect(saved.answers.purchaseDestinationUnknown).toBe(true)
  expect(saved.answers.destination).toBeUndefined()
  expect(saved.destinationAssumption).toBeUndefined()
  expect(saved.calculation.status).toBe('PENDING_DATA')
  expect(saved.calculation.result).toBeUndefined()
  expect(saved.matchingBatchItems).toHaveLength(3)
  expect(()=>saveItemFiscalAnswers(db,{batchId,documentId,itemNumber:'1',requestId:'share-held',expectedRunId:saved.runId!,reuseScope:'MATCHING_BATCH_ITEMS',answers:{purchaseDestinationUnknown:true,purchaseReviewPending:true}})).toThrow(/somente neste item/)
  expect(applyAutomaticXmlCalculations(db,batchId)).toBe(0)
  expect(getItemFiscalContext(db,batchId,documentId,'1').answers).toEqual(saved.answers)
  expect(getBatchConsolidation(db,batchId).counts.calculated).toBe(0)
 })
 it('mantém descrição ou pagamento desconhecido pendente mesmo com respostas fiscais completas',()=>{
  for(const extra of [{purchaseProductConfirmation:'UNKNOWN' as const},{purchaseProductConfirmation:'DIFFERENT' as const},{purchasePaymentStatus:'UNKNOWN' as const},{purchasePaymentStatus:'HAS_EVIDENCE' as const},{purchaseReviewPending:true}]) {
   const context=buildItemFiscalContext(notes[0]!,notes[0]!.items[0]!,{...reviewed,...extra},undefined,undefined,undefined,buyer)
   expect(context.calculation.status).toBe('PENDING_DATA')
   expect(context.calculation.result).toBeUndefined()
   expect(context.calculation.additionalComponents).toBeUndefined()
  }
 })
 it('não compartilha referência de comprovante de um item com outras notas',()=>{
  const context=buildItemFiscalContext(notes[0]!,notes[0]!.items[0]!,{...reviewed,purchasePaymentStatus:'HAS_EVIDENCE',purchasePaymentReference:'Guia desta compra'},undefined,undefined,undefined,buyer)
  expect(context.calculation.status).toBe('CALCULATED')
  const before=getItemFiscalContext(db,batchId,'00000000-0000-4000-8000-000000000104','1')
  expect(()=>saveItemFiscalAnswers(db,{batchId,documentId:'00000000-0000-4000-8000-000000000104',itemNumber:'1',requestId:'invalid-share-evidence',expectedRunId:before.runId!,reuseScope:'MATCHING_BATCH_ITEMS',answers:{...reviewed,purchasePaymentStatus:'HAS_EVIDENCE',purchasePaymentReference:'Guia desta compra'}})).toThrow(/individual/)
 })
 it('registra informações da compra sem transformá-las em aprovação da classificação fiscal',()=>{
  const documentId='00000000-0000-4000-8000-000000000104'
  const before=getItemFiscalContext(db,batchId,documentId,'1')
  const saved=saveItemFiscalAnswers(db,{batchId,documentId,itemNumber:'1',requestId:'business-facts-only',expectedRunId:before.runId!,answers:{destination:'RESALE',destinationBasis:'CONFIRMED',purchaseProductConfirmation:'MATCHES',purchasePaymentStatus:'HAS_EVIDENCE',purchasePaymentReference:'Guia de exemplo para conferir',purchaseReviewPending:true}})
  expect(saved.answers.purchaseProductConfirmation).toBe('MATCHES')
  expect(saved.answers.stClassificationConfirmed).toBeUndefined()
  expect(saved.answers.stBuyerLiabilityConfirmed).toBeUndefined()
  expect(saved.calculation.result).toBeUndefined()
  const completed=saveItemFiscalAnswers(db,{batchId,documentId,itemNumber:'1',requestId:'finish-review',expectedRunId:saved.runId!,answers:{...reviewed,purchaseProductConfirmation:'MATCHES',purchaseReviewPending:false}})
  expect(completed.calculation.status).toBe('CALCULATED')
  expect(completed.calculation.result?.amount).toBe('33.56')
 })
 it('prepara simulações por produto sem aprovar a classificação, gravar respostas ou alterar totais',()=>{
  const repo=new SqliteCalculationRepository(db)
  const before=repo.latestByDocument('00000000-0000-4000-8000-000000000104')!
  const context=getItemFiscalContext(db,batchId,'00000000-0000-4000-8000-000000000104','1')
  expect(context.entryAutomationReview).toMatchObject({category:'CLASSIFICATION_SUGGESTION',proposedCest:'2000900'})
  expect(context.entryClassificationPreview?.result?.amount).toBe('33.56')
  expect(context.entryClassificationPreview?.inputs.find(i=>i.name==='originalXmlCest')?.value).toBe('2800900')
  expect(context.entryClassificationPreview?.inputs.find(i=>i.name==='entryCalculationAssumptions')?.value).toContain('UNCONFIRMED_CLASSIFICATION_SUGGESTION')
  expect(context.entryClassificationPreview?.inputs.some(i=>i.name==='automaticCatalogCalculation')).toBe(false)
  expect(context.entryClassificationPreview?.additionalComponents?.[0]?.inputs.some(i=>i.name==='automaticCatalogCalculation')).toBe(false)
  expect(context.calculation.result).toBeUndefined()
  expect(context.answers.stClassificationConfirmed).toBeUndefined()
  expect(repo.latestByDocument('00000000-0000-4000-8000-000000000104')?.id).toBe(before.id)
  expect(getBatchConsolidation(db,batchId).counts.calculated).toBe(0)
  const detail=queryBatchDetail(db,batchId)
  expect(detail.documents.flatMap(d=>d.items).map(i=>i.entryAutomationReview?.category)).toEqual(['CLASSIFICATION_SUGGESTION','CLASSIFICATION_SUGGESTION','MISSING_CEST','CLASSIFICATION_SUGGESTION','OUTSIDE_CATALOG'])
  expect(getItemFiscalContext(db,batchId,'00000000-0000-4000-8000-000000000105','2').entryClassificationPreview).toBeUndefined()
 })
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
