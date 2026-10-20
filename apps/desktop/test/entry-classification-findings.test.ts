import { describe, expect, it } from 'vitest'
import { entryClassificationFindings } from '../src/main/entry-classification-findings'

const source = { format: 'NFE_XML_4_00' as const, xmlPath: 'NFe' }
const findings = (description: string, ncm = '33059000', cest = '2002100') =>
  entryClassificationFindings({ itemNumber:'1',description,ncm,cest,source })

describe('revisão documental de classificação', () => {
  it('identifica shampoos e produtos capilares no código de pele sem escolher um NCM final', () => {
    expect(findings('Shampoo Max Nutrition 300ml').map(f => f.code)).toContain('NCM_DESCRIPTION_REVIEW')
    expect(findings('Texturizador Capilar Escova de Argan','33049910','2805600').map(f => f.code)).toContain('NCM_DESCRIPTION_REVIEW')
    expect(findings('Shampoo hidratante','33051000','2001700')).toEqual([])
    expect(findings('Creme hidratante para pele','33049910','2001400')).toEqual([])
  })
  it('distingue ação condicionante de enquadramento como condicionador e conserva a fonte', () => {
    const item={itemNumber:'1',description:'Máscara 2 em 1 ação condicionante',ncm:'33059000',cest:'2002100',source}
    expect(entryClassificationFindings(item).map(f => f.code)).toContain('CEST_DESCRIPTION_REVIEW')
    expect(item.cest).toBe('2002100')
    expect(findings('Condicionador hidro nutritivo')).toEqual([])
    expect(findings('Máscara de tratamento','33059000','2002000')).toEqual([])
    expect(findings('Máscara facial','33049990','2001500')).toEqual([])
  })
  it('exige descrição e material compatíveis para acessórios e preserva os códigos', () => {
    expect(findings('APONTADOR S/TAMPA','82141000','').map(f=>f.code)).toContain('CEST_DESCRIPTION_REVIEW')
    expect(findings('ESPATULA','82141000','2005400')).toEqual([])
    expect(findings('TOUCA PLAST.DESC.','65050090','').map(f=>f.code)).toContain('NCM_MATERIAL_REVIEW')
    expect(findings('TOUCA REDE','65050090','')).toEqual([])
    expect(findings('SEPARADOR EVA','40149090','').map(f=>f.code)).toContain('NCM_MATERIAL_REVIEW')
    expect(findings('ESPONJA TWIST DUPLA','96162000','2006200').map(f=>f.code)).toContain('CEST_FUNCTION_REVIEW')
    expect(findings('ESPONJA PARA PO','96162000','2006200')).toEqual([])
  })
  it('sinaliza oxidantes e apresentação de perfumaria sem confirmar função por nome', () => {
    expect(findings('OX 40 Volumes 900ml','33059000','2805600')[0]?.code).toBe('NCM_TECHNICAL_REVIEW')
    expect(findings('BODY SPLASH 200ML','33072090','2002900')[0]?.code).toBe('NCM_FORM_REVIEW')
    expect(findings('LOC HIDRAT VELVETY 240ML','33072090','2002900')[0]?.code).toBe('MULTIFUNCTIONAL_REVIEW')
    expect(findings('Tintura 4.0 Castanho','33059000','2002200')).toEqual([])
  })
})
