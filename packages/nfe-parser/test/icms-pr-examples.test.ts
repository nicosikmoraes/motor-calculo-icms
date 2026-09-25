import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { normalizeNfeXml, validateNfeSchema } from '../src'

const cases = [
  { file: 'pr-pr-interna.xml', origin: 'PR', destination: 'PR', rate: '19.5000', amount: '19.50' },
  { file: 'pr-sp-interestadual.xml', origin: 'PR', destination: 'SP', rate: '12.0000', amount: '12.00' },
  { file: 'pr-ba-interestadual.xml', origin: 'PR', destination: 'BA', rate: '7.0000', amount: '7.00' },
  { file: 'ba-pr-interestadual.xml', origin: 'BA', destination: 'PR', rate: '12.0000', amount: '12.00' },
] as const

describe('exemplos sintéticos de ICMS próprio com o Paraná', () => {
  for (const scenario of cases) {
    it(`${scenario.origin} → ${scenario.destination} mantém XML 4.00 válido e valores declarados`, async () => {
      const xml = readFileSync(new URL(`./fixtures/icms-pr/${scenario.file}`, import.meta.url), 'utf8')
      const validation = await validateNfeSchema(xml, { fileName: scenario.file })
      expect(validation.valid, validation.errors.map((error) => error.rawMessage).join('\n')).toBe(true)

      const note = normalizeNfeXml(xml)
      expect(note.issuer.state).toBe(scenario.origin)
      expect(note.recipient?.state).toBe(scenario.destination)
      expect(note.items[0]?.declaredIcms).toMatchObject({
        cst: '00',
        baseAmount: '100.00',
        rate: scenario.rate,
        amount: scenario.amount,
      })
      expect(note.declaredTotals.icmsAmount).toBe(scenario.amount)
    })
  }
})
