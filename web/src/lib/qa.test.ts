import { describe, expect, it } from 'vitest'
import { checkTranslation, qaLevel } from './qa'

describe('checkTranslation', () => {
  it('passes a correct translation', () => {
    expect(checkTranslation('{{count}} sets', '{{count}} séries')).toEqual([])
  })

  it('flags an empty translation as an error', () => {
    expect(checkTranslation('Home', '  ')).toEqual([{ code: 'empty', severity: 'error' }])
  })

  it('flags missing and extra placeholders', () => {
    expect(checkTranslation('{{count}} of {{total}}', '{{count}} sur {{totl}}')).toEqual([
      { code: 'placeholdersMissing', severity: 'error', items: ['{{total}}'] },
      { code: 'placeholdersExtra', severity: 'error', items: ['{{totl}}'] },
    ])
  })

  it('accepts placeholders in a different order', () => {
    expect(checkTranslation('{{a}} and {{b}}', '{{b}} et {{a}}')).toEqual([])
  })

  it('counts repeated placeholders', () => {
    expect(checkTranslation('{{n}} / {{n}}', '{{n}}')[0]).toMatchObject({ code: 'placeholdersMissing', items: ['{{n}}'] })
  })

  it('warns when the text is identical to the source or spacing differs', () => {
    expect(checkTranslation('Routine', 'Routine')).toEqual([{ code: 'sameAsSource', severity: 'warning' }])
    expect(checkTranslation('OK', 'OK')).toEqual([{ code: 'sameAsSource', severity: 'warning' }])
    expect(checkTranslation('5', '5')).toEqual([])
    expect(checkTranslation('Save', 'Enregistrer ')).toEqual([{ code: 'outerSpaces', severity: 'warning' }])
  })
})

describe('qaLevel', () => {
  it('takes the most severe issue', () => {
    expect(qaLevel([])).toBeNull()
    expect(qaLevel(checkTranslation('Routine', 'Routine'))).toBe('warning')
    expect(qaLevel(checkTranslation('{{n}}', 'x'))).toBe('error')
  })
})
