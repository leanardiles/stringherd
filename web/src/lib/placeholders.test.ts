import { describe, expect, it } from 'vitest'
import { countCharacters, findPlaceholders, invisibleKind, missingPlaceholders, splitPlaceholders } from './placeholders'

describe('splitPlaceholders', () => {
  it('separates i18next placeholders from text', () => {
    expect(splitPlaceholders('{{count}} sets')).toEqual([
      { kind: 'placeholder', value: '{{count}}' },
      { kind: 'text', value: ' sets' },
    ])
  })

  it('recognises tags, printf and ICU arguments', () => {
    expect(findPlaceholders('<0>Hi</0> %s %1$d {name} $t(app.name) {{n, number}} <br/>')).toEqual([
      '<0>', '</0>', '%s', '%1$d', '{name}', '$t(app.name)', '{{n, number}}', '<br/>',
    ])
    expect(splitPlaceholders('<strong>Bold</strong>')[0]).toEqual({ kind: 'tag', value: '<strong>' })
  })

  it('returns plain text unchanged', () => {
    expect(splitPlaceholders('Home')).toEqual([{ kind: 'text', value: 'Home' }])
    expect(splitPlaceholders('')).toEqual([])
  })
})

describe('countCharacters', () => {
  it('counts placeholders as 1 and tags as 0', () => {
    expect(countCharacters('{{count}} sets')).toBe(6)
    expect(countCharacters('<0>Sign in</0>')).toBe(7)
  })

  it('counts accented letters and emoji as one character', () => {
    expect(countCharacters('séries')).toBe(6)
    expect(countCharacters('é')).toBe(1) // e + combining accent
    expect(countCharacters('👍🏽')).toBe(1)
  })
})

describe('missingPlaceholders', () => {
  it('lists what the translation lacks, in source order and one for one', () => {
    expect(missingPlaceholders('{{a}} of {{b}}', 'de {{a}}')).toEqual(['{{b}}'])
    expect(missingPlaceholders('{{n}} and {{n}}', '{{n}}')).toEqual(['{{n}}'])
    expect(missingPlaceholders('Read <0>terms</0>', 'Lire')).toEqual(['<0>', '</0>'])
    expect(missingPlaceholders('{{a}}', '{{a}}')).toEqual([])
  })
})

describe('invisibleKind', () => {
  it('tells the spaces apart', () => {
    expect(invisibleKind(' ')).toBe('space')
    expect(invisibleKind('\u00a0')).toBe('nbsp')
    expect(invisibleKind('\u202f')).toBe('narrowNbsp')
    expect(invisibleKind('\t')).toBe('tab')
  })
})
