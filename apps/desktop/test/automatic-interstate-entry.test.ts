import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {normalizeNfeXml} from '@motor/nfe-parser'
import {paranaInterstateEntryExclusionReason} from '@motor/domain'
import {calculateAutomaticInterstateEntry} from '../src/main/automatic-interstate-entry'
import {calculateAutomaticItem} from '../src/main/automatic-xml-calculation'
const original=normalizeNfeXml(readFileSync(new URL('./fixtures/revisao-resolucao-1245.xml',import.meta.url),'utf8'))
const note={...original,issuer:{...original.issuer,state:'SP'},destinationIndicator:'2'}
const product={...note.items[0]!,cfop:'6102',productAmount:'100.00',declaredIcms:{group:'ICMS00',cst:'00',originCode:'0',baseMode:'3',baseAmount:'100.00',rate:'12.0000',amount:'12.00'}}
const calculate=(n=note,i=product)=>calculateAutomaticInterstateEntry(n,i,n.recipient?.taxId)
describe('ST automática de compras interestaduais para PR',()=>{
 it('calcula pela MVA ajustada e separa o FCP sem usar o ICMS próprio como resultado da entrada',()=>{
  const result=calculate()!
  expect(result.status).toBe('CALCULATED')
  expect(result.result).toMatchObject({component:'ICMS_ST',amount:'27.88',rate:'23'})
  expect(result.additionalComponents?.[0]?.result?.amount).toBe('3.47')
  expect(result.inputs.find(i=>i.name==='entryCalculationAssumptions')?.value).toContain('NOT_VERIFIED')
  expect(result.inputs.some(i=>i.source==='USER/current_item')).toBe(false)
 })
 it('exclui operações internas, empresa vendedora e UF/CFOP incompatíveis',()=>{
  expect(calculate(original)).toBeUndefined()
  expect(paranaInterstateEntryExclusionReason(original,'5403',original.recipient?.taxId)).toContain('outro estado')
  expect(calculateAutomaticInterstateEntry(note,product,note.issuer.taxId)).toBeUndefined()
  expect(calculate(note,{...product,cfop:'5102'})).toBeUndefined()
  expect(calculateAutomaticItem(original,product,original.recipient?.taxId)?.status).toBe('UNSUPPORTED')
 })
 it('reconhece a entrada CFOP 2 emitida pela compradora sem converter o CFOP do fornecedor',()=>{
  const ownNote={...note,operationDirection:'0',issuer:{...note.recipient!,taxRegimeCode:'3'},recipient:{...note.issuer}}
  const result=calculateAutomaticInterstateEntry(ownNote,{...product,cfop:'2102'},ownNote.issuer.taxId)
  expect(result?.status).toBe('CALCULATED')
  expect(result?.result?.amount).toBe('27.88')
 })
 it('considera desconto incondicional somente quando base e ICMS do XML reconciliam',()=>{
  const item={...product,discountAmount:'10.00',declaredIcms:{...product.declaredIcms,baseAmount:'90.00',amount:'10.80'}}
  expect(calculate(note,item)?.result?.amount).toBe('25.09')
  expect(calculate(note,{...item,declaredIcms:{...item.declaredIcms,baseAmount:'95.00'}})?.status).toBe('PENDING_DATA')
 })
 it('não inventa MVA, ICMS próprio ausente ou nova retenção sobre ST anterior',()=>{
  expect(calculate(note,{...product,cest:'9999999'})?.status).toBe('PENDING_RULE')
  const {amount,...tax}=product.declaredIcms
  expect(calculate(note,{...product,declaredIcms:tax} as typeof product)?.status).toBe('PENDING_DATA')
  expect(calculate(note,{...product,declaredIcms:{...product.declaredIcms,group:'ICMS60',cst:'60'}})).toBeUndefined()
 })
 it('usa MVA original no Simples e não deduz crédito do Simples',()=>{
  const n={...note,issuer:{...note.issuer,taxRegimeCode:'1'}}
  const item={...product,declaredIcms:{group:'ICMSSN102',csosn:'102',originCode:'0'}}
  const result=calculateAutomaticInterstateEntry(n,item,n.recipient?.taxId)!
  expect(result.status).toBe('CALCULATED')
  expect(result.result?.amount).toBe('21.99')
  expect(result.inputs.find(i=>i.name==='mvaMode')?.value).toBe('ORIGINAL')
 })
})
