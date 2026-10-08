import { describe, expect, it } from 'vitest'
import { formatPercent, languageLabel } from './languages'

describe('languageLabel', () => {
  it('names the language in the UI language and keeps the code', () => {
    expect(languageLabel('fr', 'en')).toBe('French (fr)')
    expect(languageLabel('es-AR', 'en')).toBe('Spanish (Argentina) (es-AR)')
    expect(languageLabel('fr', 'es')).toBe('francés (fr)')
  })

  it('falls back to the code for unknown or invalid codes', () => {
    expect(languageLabel('zz', 'en')).toBe('zz')
    expect(languageLabel('not a code', 'en')).toBe('not a code')
  })
})

describe('formatPercent', () => {
  it('formats per locale', () => {
    expect(formatPercent(0.466, 'en')).toBe('47%')
    expect(formatPercent(0.466, 'fr')).toMatch(/^47[\u00a0\u202f]%$/)
  })
})
