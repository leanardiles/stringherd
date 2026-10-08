import { describe, expect, it } from 'vitest'
import { pseudoize, pseudoizeCatalog } from './pseudo'

describe('pseudoize', () => {
  it('accents letters, brackets the text and makes it longer', () => {
    const result = pseudoize('Approve')
    expect(result.startsWith('[Àƥƥŕöṽé ')).toBe(true)
    expect(result.endsWith(']')).toBe(true)
    expect(result.length).toBeGreaterThan('Approve'.length + 2)
  })

  it('leaves placeholders untouched', () => {
    expect(pseudoize('{{count}} strings to review')).toContain('{{count}}')
    expect(pseudoize('{{approved, number}} of {{total, number}}')).toContain('{{approved, number}}')
  })

  it('works through nested catalogs', () => {
    expect(pseudoizeCatalog({ a: { b: 'Sign in' } })).toEqual({ a: { b: expect.stringContaining('Šîĝñ îñ') } })
  })
})
