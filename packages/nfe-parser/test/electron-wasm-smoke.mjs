import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateXML } from 'xmllint-wasm'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const schemaDirectory = join(currentDirectory, '../schemas/PL_010f_v1.04')
const fixturePath = join(currentDirectory, 'fixtures/nfe-proc-minima.xml')
const entryName = 'procNFe_v4.00.xsd'
const schemaNames = [
  'DFeTiposBasicos_v1.00.xsd',
  'leiauteNFe_v4.00.xsd',
  'nfe_v4.00.xsd',
  entryName,
  'tiposBasico_v4.00.xsd',
  'xmldsig-core-schema_v1.01.xsd',
]

const startedAt = performance.now()
const xml = await readFile(fixturePath, 'utf8')
const schemas = await Promise.all(
  schemaNames.map(async (fileName) => ({
    fileName,
    contents: await readFile(join(schemaDirectory, fileName), 'utf8'),
  })),
)
const entry = schemas.find((schema) => schema.fileName === entryName)
const result = await validateXML({
  xml: [{ fileName: 'nfe-proc-minima.xml', contents: xml }],
  schema: [entry],
  preload: schemas.filter((schema) => schema !== entry),
})

if (!result.valid) {
  console.error(result.errors.map((error) => error.rawMessage).join('\n'))
  process.exitCode = 1
} else {
  console.log(
    JSON.stringify({
      runtime: `Electron ${process.versions.electron}`,
      wasmValidation: 'ok',
      schemaRelease: 'PL_010f_v1.04',
      durationMs: Math.round(performance.now() - startedAt),
    }),
  )
}
