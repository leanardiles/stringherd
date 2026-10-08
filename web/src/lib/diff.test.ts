import { describe, expect, it } from 'vitest'
import { diffWords } from './diff'

describe('diffWords', () => {
  it('marks a replaced word', () => {
    expect(diffWords('{{count}} définit', '{{count}} séries')).toEqual([
      { op: 'equal', text: '{{count}} ' },
      { op: 'delete', text: 'définit' },
      { op: 'insert', text: 'séries' },
    ])
  })

  it('keeps placeholders whole and handles additions', () => {
    expect(diffWords('Bonjour', 'Bonjour {{name}} !')).toEqual([
      { op: 'equal', text: 'Bonjour' },
      { op: 'insert', text: ' {{name}} !' },
    ])
  })

  it('returns a single equal part for identical text', () => {
    expect(diffWords('Accueil', 'Accueil')).toEqual([{ op: 'equal', text: 'Accueil' }])
  })
})
