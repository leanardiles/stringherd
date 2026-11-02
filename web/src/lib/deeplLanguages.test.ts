import { describe, expect, it } from 'vitest'
import { isDeeplTarget, searchDeeplLanguages } from './deeplLanguages'

const codes = (query: string) => searchDeeplLanguages(query, 'en').map((option) => option.code)

describe('DeepL target languages', () => {
  it('finds a language by name, DeepL name or code, best match first', () => {
    expect(codes('dutch')[0]).toBe('nl')
    expect(codes('nl')[0]).toBe('nl')
    expect(codes('latin')).toContain('es-419')
    expect(codes('chinese')).toEqual(expect.arrayContaining(['zh-Hans', 'zh-Hant']))
    expect(codes('flamenco')).toEqual([])
  })

  it('offers English and Portuguese only as the variants DeepL translates into', () => {
    expect(isDeeplTarget('en')).toBe(false)
    expect(isDeeplTarget('en-GB')).toBe(true)
    expect(isDeeplTarget('pt')).toBe(false)
    expect(isDeeplTarget('pt-BR')).toBe(true)
    expect(isDeeplTarget('es-AR')).toBe(false)
    expect(isDeeplTarget('ES-419')).toBe(true)
  })

  it('shows names in the interface language', () => {
    expect(searchDeeplLanguages('es-419', 'es')[0]).toMatchObject({ name: 'español', region: 'Latinoamérica' })
  })
})
