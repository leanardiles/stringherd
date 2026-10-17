import { describe, expect, it } from 'vitest'
import { formatPercent, languageLabel, languageParts } from './languages'

describe('languageLabel', () => {
  it('names the language in the UI language and keeps the code', () => {
    expect(languageLabel('fr', 'en')).toBe('French (fr)')
    expect(languageLabel('es-AR', 'en')).toBe('Spanish (es-AR) · Argentina')
    expect(languageLabel('es-419', 'en')).toBe('Spanish (es-419) · Latin America')
    expect(languageLabel('fr', 'es')).toBe('francés (fr)')
  })

  it('falls back to the code for unknown or invalid codes', () => {
    expect(languageLabel('zz', 'en')).toBe('zz')
    expect(languageLabel('not a code', 'en')).toBe('not a code')
  })
})

describe('languageParts', () => {
  it('keeps the code with the language and puts the region apart', () => {
    expect(languageParts('es-419', 'en')).toEqual({ name: 'Spanish', region: 'Latin America', code: 'es-419' })
    expect(languageParts('fr', 'en')).toEqual({ name: 'French', region: undefined, code: 'fr' })
    expect(languageParts('pt-BR', 'es')).toEqual({ name: 'portugués', region: 'Brasil', code: 'pt-BR' })
  })

  it('keeps a script with the language', () => {
    expect(languageParts('zh-Hant-TW', 'en')).toEqual({ name: 'Traditional Chinese', region: 'Taiwan', code: 'zh-Hant-TW' })
  })

  it('returns an unknown or invalid code as its own name', () => {
    expect(languageParts('zz', 'en')).toEqual({ name: 'zz', code: 'zz' })
    expect(languageParts('not a code', 'en')).toEqual({ name: 'not a code', code: 'not a code' })
  })
})

describe('formatPercent', () => {
  it('formats per locale', () => {
    expect(formatPercent(0.466, 'en')).toBe('47%')
    expect(formatPercent(0.466, 'fr')).toMatch(/^47[\u00a0\u202f]%$/)
  })
})
