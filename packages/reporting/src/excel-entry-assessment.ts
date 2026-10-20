import type ExcelJS from 'exceljs'
import type { ReportData } from './report-data'
import { buildEntryAssessment } from './entry-assessment'
import { roundMoney } from '@motor/tax-engine'

/** Layout compacto da planilha de referência; usa somente o snapshot já conferido. */
export function addEntryAssessmentSheet(book: ExcelJS.Workbook, report: ReportData): void {
  const data = buildEntryAssessment(report)
  const sheet = book.addWorksheet('Entradas', { views: [{ showGridLines: false, state: 'frozen', ySplit: 5 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:5' } })
  sheet.columns = [5,14,5,14,19,22,18,13,18,13,18].map(width => ({ width }))
  const money = (row: number, col: number, value?: string) => {
    const cell=sheet.getCell(row,col)
    if (value !== undefined) {
      const text=roundMoney(value), number=Number(text)
      if (text.replace(/[-.]/g,'').replace(/^0+/,'').length>15 || number.toFixed(2)!==text) cell.value=text
      else cell.value=number
    }
    cell.numFmt='"R$" #,##0.00;[Red]-"R$" #,##0.00'
  }
  const band=(row:number,title:string) => {
    sheet.mergeCells(row,1,row,11); const cell=sheet.getCell(row,1);cell.value=title
    cell.font={name:'Arial',size:12,bold:true,color:{argb:'FF17365D'}};sheet.getRow(row).height=27
  }
  const total=(row:number,title:string,value?:string) => {
    sheet.mergeCells(row,1,row,4);sheet.getCell(row,1).value=title
    if(value===undefined)sheet.getCell(row,5).value='Pendente';else money(row,5,value)
    sheet.getRow(row).font={name:'Arial',size:10,bold:true};sheet.getRow(row).height=25
  }
  band(1,'DIFERENCIAL DE ALÍQUOTA DE ICMS POR ENTRADA')
  sheet.mergeCells('A2:K2');sheet.getCell('A2').value=`${report.monthly?.companyName ?? 'Conferência de entradas'}${report.monthly ? ` — ${report.monthly.period}` : ''}`
  sheet.mergeCells('A3:K3');sheet.getCell('A3').value='Antecipação: somar valores exatos e arredondar o total. ST: valores salvos por item. FCP-ST em subtotal separado.';sheet.getRow(3).height=23
  sheet.mergeCells('A4:K4');sheet.getCell('A4').value=data.partial ? `${data.issues.length} itens aguardam revisão. Subtotais parciais; total a pagar pendente.` : data.total===undefined ? 'Nenhuma obrigação de entrada confirmada.' : 'Obrigações de entrada conferidas para os documentos selecionados.';sheet.getRow(4).height=23
  sheet.getRow(5).values=[undefined,'NF',undefined,'Data','ICMS diferença','NCM / produtos','BC ICMS','Alíq. inter','ICMS inter','Carga interna','ICMS interno']
  let row=6
  for(const entry of data.difal){
    sheet.getRow(row).values=['NF',entry.number,'DE',entry.issuedAt?.slice(0,10),undefined,entry.ncm]
    if(entry.issuedAt){sheet.getCell(row,4).value=new Date(`${entry.issuedAt.slice(0,10)}T00:00:00Z`);sheet.getCell(row,4).numFmt='dd/mm/yyyy'}
    money(row,5,entry.amount);money(row,7,entry.base);money(row,9,entry.interstateAmount);money(row,11,entry.internalAmount)
    sheet.getCell(row,8).value=Number(entry.interstateRate)/100;sheet.getCell(row,8).numFmt='0.00%'
    sheet.getCell(row,10).value=Number(entry.internalRate)/100;sheet.getCell(row,10).numFmt='0.00%';row++
  }
  if(!data.difal.length){sheet.getCell(row++,2).value='Sem valores confirmados'}
  total(row++,'TOTAL DIFERENCIAL CONFERIDO',data.differenceTotal);row++
  band(row++,'ICMS ST — ENTRADAS')
  const stHeader=row++;sheet.getRow(stHeader).values=[undefined,'NF',undefined,'Data','ICMS-ST','NCM / alíquota inter','Base ST','Alíq. interna']
  for(const entry of data.st){
    sheet.getRow(row).values=['NF',entry.number,'DE',entry.issuedAt?.slice(0,10),undefined,`${entry.ncm ?? 'NCM ausente'}${entry.interstateRate ? ` / ${entry.interstateRate}%` : ''}`]
    if(entry.issuedAt){sheet.getCell(row,4).value=new Date(`${entry.issuedAt.slice(0,10)}T00:00:00Z`);sheet.getCell(row,4).numFmt='dd/mm/yyyy'}
    money(row,5,entry.amount);money(row,7,entry.base);sheet.getCell(row,8).value=Number(entry.internalRate)/100;sheet.getCell(row,8).numFmt='0.00%';row++
  }
  if(!data.st.length){sheet.getCell(row++,2).value='Sem valores confirmados'}
  total(row++,'TOTAL ICMS-ST CONFERIDO',data.stTotal);row++
  if(data.fcpTotal !== undefined)total(row++,'TOTAL FCP-ST CONFERIDO',data.fcpTotal)
  total(row++,data.partial ? 'TOTAL A PAGAR — PENDENTE' : 'TOTAL DAS ENTRADAS CONFERIDAS',data.total)
  if(data.issues.length){
    row++;band(row++,'PENDÊNCIAS DA APURAÇÃO DE ENTRADAS')
    const issueHeader=row++;sheet.getRow(issueHeader).values=[undefined,'NF','Item','NCM','Motivo']
    for(const issue of data.issues){sheet.getRow(row).values=[undefined,issue.number,issue.itemNumber,issue.ncm];sheet.mergeCells(row,5,row,11);sheet.getCell(row,5).value=issue.reason;sheet.getCell(row,5).alignment={wrapText:true,vertical:'middle'};sheet.getRow(row).height=Math.max(30,Math.ceil(issue.reason.length/100)*15+6);row++}
  }
  if(data.noDebit.length){
    row++;band(row++,'ENTRADAS REVISADAS SEM NOVO DÉBITO')
    sheet.getRow(row++).values=[undefined,'NF','Item','NCM','Fundamento registrado']
    for(const decision of data.noDebit){sheet.getRow(row).values=[undefined,decision.number,decision.itemNumber,decision.ncm];sheet.mergeCells(row,5,row,11);sheet.getCell(row,5).value=decision.reason;sheet.getCell(row,5).alignment={wrapText:true,vertical:'middle'};sheet.getRow(row).height=Math.max(30,Math.ceil(decision.reason.length/100)*15+6);row++}
  }
  for(let r=2;r<row;r++)sheet.getRow(r).eachCell(cell=>{cell.font={name:'Arial',size:10,...cell.font};cell.alignment={vertical:'middle',...cell.alignment};if(cell.type===3)cell.numFmt='@'})
  for(const r of [5,stHeader]){sheet.getRow(r).height=34;sheet.getRow(r).eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE6ECF3'}};cell.font={name:'Arial',size:10,bold:true};cell.alignment={wrapText:true,vertical:'middle',horizontal:'center'}})}
  sheet.pageSetup.printArea=`A1:K${row-1}`
}
