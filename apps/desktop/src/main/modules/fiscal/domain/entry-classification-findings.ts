import type { NormalizedNfeItem } from '@motor/domain'

/** Sinais para revisão humana; nomes comerciais não determinam NCM nem mudam o XML. */
export function entryClassificationFindings(item: NormalizedNfeItem) {
  const description = (item.description ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  const findings: { code: string; reason: string }[] = []
  if (item.ncm === '33059000' && /\b(SHAMPOO|XAMPU)\b/.test(description))
    findings.push({ code: 'NCM_DESCRIPTION_REVIEW', reason: 'Produto descrito como shampoo, mas NCM 33059000 no XML. Conferir ficha fiscal: xampus estão na subposição 3305.10; não calcular como preparação capilar genérica sem resolver a divergência.' })
  if (item.ncm?.startsWith('3304') && /\b(CAPILAR|CABELO)\b/.test(description))
    findings.push({ code: 'NCM_DESCRIPTION_REVIEW', reason: 'A descrição indica produto capilar, mas o NCM do XML pertence a cuidados da pele/maquiagem (3304). Conferir função e composição para revisar a posição 3305; o nome não define o código completo.' })
  if (item.ncm === '33059000' && /\bOX\s*\d|AGUA OXIGENADA/.test(description))
    findings.push({ code: 'NCM_TECHNICAL_REVIEW', reason: 'Oxidante/água oxigenada: conferir composição, preparação cosmética e volume da embalagem. Não presumir NCM de preparação capilar nem usar a linha de peróxido em embalagem de até 500 ml para um frasco de 900 ml.' })
  if (item.ncm === '33059000' && item.cest === '2002100'
    && /\b(MASCARA|FINALIZADOR|MOUSSE|GELATINA|GELEIA|GOMMAGE|ACIDIFICANTE)\b|CREME (DE|PARA) PENTEAR|GEL CREME/.test(description))
    findings.push({ code: 'CEST_DESCRIPTION_REVIEW', reason: 'CEST 2002100 corresponde a condicionadores, enquanto a descrição indica máscara/finalizador ou outra preparação. Revisar a linha 2002000 (ou a função específica) pela ficha do produto; ação condicionante acessória não encerra o enquadramento.' })
  if (item.ncm === '33072090' && /\bBODY SPLASH\b/.test(description))
    findings.push({ code: 'NCM_FORM_REVIEW', reason: 'Body splash no código 33072090 (outros desodorantes): conferir estado físico e função desodorante. A apresentação líquida e a composição podem exigir outro código; não inferir somente pelo nome comercial.' })
  if (item.ncm?.startsWith('330720') && /\b(LOC|LOCAO)\b.*\bHIDRAT/.test(description))
    findings.push({ code: 'MULTIFUNCTIONAL_REVIEW', reason: 'Loção hidratante classificada como desodorante: conferir função desodorante, composição e ficha fiscal. Hidratar/perfumar a pele, isoladamente, não comprova ação desodorante nem autoriza trocar o NCM automaticamente.' })
  if (item.ncm === '82141000' && /\bAPONTADOR\b/.test(description))
    findings.push({ code: 'CEST_DESCRIPTION_REVIEW', reason: 'Apontador não corresponde à descrição de espátulas do CEST 2005400, embora compartilhe NCM 82141000. Conferir o segmento e a regra da operação antes de escolher uma candidata de ST.' })
  if (item.ncm === '65050090' && /\b(PLAST|PLASTICA|PVC)\b/.test(description))
    findings.push({ code: 'NCM_MATERIAL_REVIEW', reason: 'Touca descrita como plástica/PVC em NCM de artefatos têxteis. Conferir material e ficha fiscal antes de definir classificação e tributação.' })
  if (item.ncm === '40149090' && /\bEVA\b/.test(description))
    findings.push({ code: 'NCM_MATERIAL_REVIEW', reason: 'Separador descrito como EVA em NCM de artigos de borracha de higiene/farmácia. Conferir composição e classificação; não atribuir CEST de mamadeiras ou chupetas pela coincidência de NCM.' })
  if (item.ncm === '96162000' && /\bTWIST\b/.test(description))
    findings.push({ code: 'CEST_FUNCTION_REVIEW', reason: 'Esponja Twist: confirmar se a função é aplicar pó/cosmético, como exige a descrição do CEST 2006200, ou modelar cabelo. NCM e CEST informados, isoladamente, não encerram o enquadramento.' })
  return findings
}
