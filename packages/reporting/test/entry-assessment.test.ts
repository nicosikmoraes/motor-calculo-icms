import { describe, expect, it } from 'vitest'
import { buildEntryAssessment } from '../src/entry-assessment'
import { createExcelWorkbook } from '../src/excel-report'
import { buildBatchConsolidation } from '../src/consolidation'
import { calculateParanaEntryRateDifference } from '@motor/tax-engine'
import { excelFixture } from './excel-report.fixture'

function fixture() {
  const report = structuredClone(excelFixture())
  const document=report.documents[0]!
  Object.assign(document,{companyCnpj:'11222333000181',recipientTaxId:'11222333000181',issuerTaxId:'11444777000161'})
  report.items=[report.items[0]!]
  const item=report.items[0]!
  item.cfop='6102'
  item.calculation=calculateParanaEntryRateDifference({operationDate:'2026-09-30',issuerState:'SP',recipientState:'PR',supplierRegime:'3',merchandiseOrigin:'2',
    baseAmount:'2184.86',interstateRate:'4',internalRate:'12',applicationConfirmed:true,baseConfirmed:true})
  item.calculation.inputs=[...item.calculation.inputs,{name:'fiscalAnswers',value:JSON.stringify({entryMethod:'RATE_DIFFERENCE'}),source:'USER/current_item',treatment:'INCLUDED'}]
  report.consolidation=buildBatchConsolidation(report.batch.id,[{documentId:document.id,companyId:'company',documentNumber:document.number,accessKey:document.accessKey,
    issuedAt:document.issuedAt,perspective:'PURCHASES',environment:'1',authorization:'WITH_PROTOCOL',items:[{itemNumber:item.itemNumber,
      declaredIcms:'87.39',declaredFcpSt:'0.00',memory:{schemaVersion:1,...item.calculation}}]}])
  report.monthly={companyId:'company',companyName:'Empresa de teste',period:'2026-09',batches:[{id:report.batch.id,status:'CONCLUIDO',name:'notas.zip'}]}
  return structuredClone(report)
}
describe('resumo das obrigações de entrada',()=>{
  it('não compara a antecipação com o ICMS próprio e não cria FCP-ST por zeros do XML',()=>{
    const report=fixture()
    expect(report.consolidation!.evidence).toHaveLength(1)
    expect(report.consolidation!.evidence[0]).toMatchObject({component:'ICMS_ENTRY',calculatedIcms:'174.79'})
    expect(report.consolidation!.evidence[0]!.declaredIcms).toBeUndefined()
    expect(report.consolidation!.evidence[0]!.comparison).toBeUndefined()
    expect(report.consolidation!.counts.declaredMissing).toBe(0)
    expect(buildEntryAssessment(report)).toMatchObject({differenceTotal:'174.79',total:'174.79',issues:[]})
    const book=createExcelWorkbook(report)
    expect(book.worksheets[0]?.name).toBe('Entradas')
    expect(book.getWorksheet('Entradas')!.getCell('E6').value).toBe(174.79)
    expect(book.getWorksheet('Entradas')!.getCell('H6').value).toBe(0.04)
    expect(book.getWorksheet('Itens')!.getCell('G6').value).toBeNull()
  })
  it('mantém subtotal parcial e total indisponível com item ainda não enquadrado',()=>{
    const report=fixture(),first=report.items[0]!
    report.items=[first,{...first,itemNumber:'2',calculation:{status:'PENDING_DATA',inputs:[],steps:[]}}]
    const result=buildEntryAssessment(report)
    expect(result.differenceTotal).toBe('174.79');expect(result.total).toBeUndefined();expect(result.issues).toHaveLength(1)
    expect(createExcelWorkbook(report).getWorksheet('Entradas')!.getCell('A4').text).toContain('parciais')
  })
  it('totaliza a antecipação exata antes de arredondar, conservando a memória de cada item',()=>{
    const report=fixture(),item=report.items[0]!,document=report.documents[0]!
    const memory=calculateParanaEntryRateDifference({operationDate:'2026-09-30',issuerState:'SP',recipientState:'PR',supplierRegime:'3',merchandiseOrigin:'2',
      baseAmount:'0.06',interstateRate:'4',internalRate:'12',applicationConfirmed:true,baseConfirmed:true})
    memory.inputs=[...memory.inputs,{name:'fiscalAnswers',value:JSON.stringify({entryMethod:'RATE_DIFFERENCE'}),source:'USER/current_item',treatment:'INCLUDED'}]
    report.items=[{...item,calculation:memory},{...item,itemNumber:'2',calculation:memory}]
    report.consolidation=buildBatchConsolidation(report.batch.id,[{documentId:document.id,companyId:'company',documentNumber:document.number,accessKey:document.accessKey,
      issuedAt:document.issuedAt,perspective:'PURCHASES',environment:'1',authorization:'WITH_PROTOCOL',items:[{itemNumber:'1',memory},{itemNumber:'2',memory}]}])
    expect(memory.result?.amount).toBe('0.00')
    expect(report.consolidation.groups[0]!.totals.calculatedIcms).toBe('0.01')
    expect(report.consolidation.evidence[0]!.exactCalculatedIcms).toBe('0.0048')
    expect(buildEntryAssessment(report).total).toBe('0.01')
    expect(createExcelWorkbook(report).getWorksheet('Entradas')!.getCell('E6').value).toBe(0.01)
  })
  it.each(['EXCLUDED','PENDING','UNSUPPORTED'] as const)('exclui memória salva que não está elegível: %s',status=>{
    const report=fixture();report.consolidation!.evidence[0]!.status=status
    expect(buildEntryAssessment(report)).toMatchObject({difal:[],issues:[expect.anything()]})
  })
  it('não transforma cálculo automático do fornecedor em obrigação a recolher',()=>{
    const report=fixture();report.items[0]!.calculation.inputs=[]
    expect(buildEntryAssessment(report).total).toBeUndefined()
    expect(buildEntryAssessment(report).issues).toHaveLength(1)
  })
  it('distingue ausência de novo débito confirmada de valor ainda indisponível',()=>{
    const report=fixture(),item=report.items[0]!
    item.calculation={component:'ICMS_ENTRY',status:'CALCULATED',rule:{id:'PR_ENTRY_NO_NEW_DEBIT',version:1,legalBasis:'Retenção já conferida'},
      inputs:[{name:'fiscalAnswers',value:JSON.stringify({entryMethod:'NO_DEBIT',entryNoDebitConfirmed:true}),source:'USER/current_item',treatment:'INCLUDED'}],steps:[],result:{component:'ICMS_ENTRY',amount:'0.00',base:'0.00',rate:'0'}}
    report.consolidation!.evidence[0]!.calculatedIcms='0.00'
    const result=buildEntryAssessment(report)
    expect(result.total).toBe('0.00');expect(result.noDebit).toHaveLength(1);expect(result.issues).toEqual([])
    report.consolidation!.evidence[0]!.status='EXCLUDED'
    expect(buildEntryAssessment(report).total).toBeUndefined()
  })
  it('soma ICMS-ST e FCP-ST uma vez e mantém subtotais separados',()=>{
    const report=fixture(),item=report.items[0]!,anchor=report.consolidation!.evidence[0]!
    item.calculation={component:'ICMS_ST',status:'CALCULATED',inputs:[{name:'fiscalAnswers',value:JSON.stringify({entryMethod:'ICMS_ST'}),source:'USER/current_item',treatment:'INCLUDED'}],steps:[],
      result:{component:'ICMS_ST',amount:'100.00',base:'1000.00',rate:'23'},additionalComponents:[{component:'FCP_ST',status:'CALCULATED',inputs:[],steps:[],result:{component:'FCP_ST',amount:'20.00',base:'1000.00',rate:'2'}}]}
    report.consolidation!.evidence=[{...anchor,component:'ICMS_ST',calculatedIcms:'100.00'},{...anchor,component:'FCP_ST',calculatedIcms:'20.00'}]
    expect(buildEntryAssessment(report)).toMatchObject({stTotal:'100.00',fcpTotal:'20.00',total:'120.00',issues:[]})
    report.consolidation!.evidence[1]!.status='EXCLUDED'
    expect(buildEntryAssessment(report).total).toBeUndefined()
  })
  it.each(['UNVERIFIED','WITH_PROTOCOL'] as const)('mantém homologação fora da apuração em produção: %s',authorization=>{
    const report=fixture();report.consolidation!.evidence[0]!.environment='2';report.consolidation!.evidence[0]!.authorization=authorization
    expect(buildEntryAssessment(report).total).toBeUndefined()
  })
})
