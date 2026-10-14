import { describe, expect, it } from 'vitest'
import type { ReviewString } from '../api/client'
import { countByFilter, displayStatus, matchesFilter, neighbourKey } from './review'

const base: ReviewString = {
  key: 'home.title', source_text: 'Home', source_file: null, value: 'Accueil', machine_translation: 'Accueil',
  status: 'machine_translated', updated_at: null, approved_at: null, approved_by: null,
  delivered_value: null, delivered_at: null, delivered_by: null,
}

describe('displayStatus', () => {
  it('distinguishes machine translation, edited, approved and delivered', () => {
    expect(displayStatus(base)).toBe('mt')
    expect(displayStatus({ ...base, value: "Page d'accueil" })).toBe('edited')
    expect(displayStatus({ ...base, status: 'approved', value: "Page d'accueil" })).toBe('approved')
    expect(displayStatus({ ...base, status: 'delivered', value: "Page d'accueil" })).toBe('delivered')
  })
})

describe('matchesFilter', () => {
  const approved = { ...base, status: 'approved' }
  const delivered = { ...base, status: 'delivered' }

  it('filters by status; open work leaves delivered strings out', () => {
    expect(matchesFilter(base, 'review', '')).toBe(true)
    expect(matchesFilter(base, 'approved', '')).toBe(false)
    expect(matchesFilter(approved, 'review', '')).toBe(false)
    expect(matchesFilter(approved, 'all', '')).toBe(true)
    expect(matchesFilter(delivered, 'all', '')).toBe(false)
    expect(matchesFilter(delivered, 'delivered', '')).toBe(true)
  })

  it('searches key, source and translation, ignoring case', () => {
    expect(matchesFilter(base, 'all', 'HOME')).toBe(true)
    expect(matchesFilter(base, 'all', 'accueil')).toBe(true)
    expect(matchesFilter(base, 'all', 'title')).toBe(true)
    expect(matchesFilter(base, 'all', 'profil')).toBe(false)
  })

  it('counts each filter', () => {
    expect(countByFilter([base, base, { status: 'approved' }, { status: 'delivered' }])).toEqual({
      all: 3,
      review: 2,
      approved: 1,
      delivered: 1,
    })
  })
})

describe('neighbourKey', () => {
  const keys = ['a', 'b', 'c']
  it('moves within the list and stops at the ends', () => {
    expect(neighbourKey(keys, 'a', 1)).toBe('b')
    expect(neighbourKey(keys, 'c', 1)).toBeNull()
    expect(neighbourKey(keys, 'a', -1)).toBeNull()
    expect(neighbourKey(keys, null, 1)).toBe('a')
    expect(neighbourKey(keys, null, -1)).toBe('c')
    expect(neighbourKey([], 'a', 1)).toBeNull()
  })
})
