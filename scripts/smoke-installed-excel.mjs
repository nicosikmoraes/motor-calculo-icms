import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { inflateRawSync } from 'node:zlib'

// Importa exclusivamente o gerador compilado e distribuído, sem pacotes do checkout.
assert.ok(process.argv[2], 'Informe o gerador instalado')
const { generateExcelReport } = await import(pathToFileURL(resolve(process.argv[2])).href)
const counts = { documents: 1, items: 1, calculated: 1, pending: 0, unsupported: 0, excluded: 0,
  declaredMissing: 0, declaredInvalid: 0, deferredMissing: 0, divergentItems: 1, withinToleranceItems: 0, comparableItems: 1 }
const comparison = { component: 'ICMS', calculated: '120.00', declared: '119.98', difference: '0.02', tolerance: '0.01', status: 'DIFFERENT' }
const report = { schemaVersion: 1, metadata: { generatedAt: '2026-10-04T12:00:00.000Z', appVersion: 'smoke' },
  batch: { id: 'lote-smoke' }, documents: [{ id: 'doc', number: '0001', series: '01', issuedAt: '2026-09-30T23:30:00-03:00' }],
  items: [{ documentId: 'doc', itemNumber: '1', supplierProductCode: '001', ncm: '01012100', cfop: '5102',
    description: '=texto externo preservado', declaredIcmsAmount: '119.98', calculation: { result: { base: '1000.00', amount: '120.00' } } }],
  pendencies: [], diagnostics: [], occurrences: [], artifacts: [],
  consolidation: { batchId: 'lote-smoke', groups: [{ companyId: 'company', companyName: 'Empresa de teste', period: '2026-09',
    perspective: 'SALES', environment: '1', authorization: 'WITH_PROTOCOL', counts,
    totals: { calculatedBase: '1000.00', calculatedIcms: '120.00', declaredIcms: '119.98', deferredIcms: '75.00',
      comparedCalculatedIcms: '120.00', comparedDeclaredIcms: '119.98', difference: '0.02', absoluteDifferences: '0.02' } }],
    evidence: [{ documentId: 'doc', itemNumber: '1', companyId: 'company', period: '2026-09', perspective: 'SALES', environment: '1',
      authorization: 'WITH_PROTOCOL', documentNumber: '0001', accessKey: '0'.repeat(44), status: 'CALCULATED',
      calculatedIcms: '120.00', declaredIcms: '119.98', deferredIcms: '75.00', comparison, reasons: [], runId: 'run', engineVersion: 'smoke' }] } }
const zip = Buffer.from(await generateExcelReport(report))
assert.equal(zip.readUInt32LE(0), 0x04034b50)
const entries = new Map()
let offset = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
while (offset >= 0 && zip.readUInt32LE(offset) === 0x02014b50) {
  const nameLength = zip.readUInt16LE(offset + 28), extraLength = zip.readUInt16LE(offset + 30), commentLength = zip.readUInt16LE(offset + 32)
  const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
  const local = zip.readUInt32LE(offset + 42), method = zip.readUInt16LE(offset + 10)
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
  const compressed = zip.subarray(start, start + zip.readUInt32LE(offset + 20))
  assert.ok(method === 0 || method === 8, 'Compressão XLSX inesperada')
  entries.set(name, (method === 8 ? inflateRawSync(compressed) : compressed).toString('utf8'))
  offset += 46 + nameLength + extraLength + commentLength
}
assert.ok(entries.has('[Content_Types].xml'))
const workbook = entries.get('xl/workbook.xml')
for (const name of ['Resumo', 'Itens', 'Divergências', 'Pendências e exclusões']) assert.ok(workbook?.includes(`name="${name}"`), name)
assert.ok(entries.get('xl/sharedStrings.xml')?.includes('0'.repeat(44)))
assert.ok(entries.get('xl/sharedStrings.xml')?.includes('=texto externo preservado'))
assert.ok(entries.get('xl/worksheets/sheet1.xml')?.includes('<v>120</v>'))
assert.ok(entries.get('xl/worksheets/sheet3.xml')?.includes('<v>0.02</v>'))
for (let sheet = 1; sheet <= 4; sheet++) {
  assert.ok(entries.get(`xl/worksheets/sheet${sheet}.xml`))
  assert.ok(!entries.get(`xl/worksheets/sheet${sheet}.xml`).includes('<f>'), 'Texto externo interpretado como fórmula')
}
console.log(JSON.stringify({ installedExcelExport: 'ok', platform: process.platform, bytes: zip.length, worksheets: 4 }))
