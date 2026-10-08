import { describe, expect, it } from 'vitest'
import type { ReviewString } from '../api/client'
import { displayStatus, matchesFilter, neighbourKey } from './review'

const base: ReviewString = {
  key: 'home.title', source_text: 'Home', source_file: null, value: 'Accueil', machine_translation: 'Accueil',
  status: 'machine_translated', updated_at: null, approved_at: null, approved_by: null,
}

describe('displayStatus', () => {
  it('distinguishes machine translation, edited and approved', () => {
    expect(displayStatus(base)).toBe('mt')
    expect(displayStatus({ ...base, value: "Page d'accueil" })).toBe('edited')
    expect(displayStatus({ ...base, status: 'approved', value: "Page d'accueil" })).toBe('approved')
  })
})

describe('matchesFilter', () => {
  it('filters by status', () => {
    expect(matchesFilter(base, 'review', '')).toBe(true)
    expect(matchesFilter(base, 'approved', '')).toBe(false)
    expect(matchesFilter({ ...base, status: 'approved' }, 'review', '')).toBe(false)
  })

  it('searches key, source and translation, ignoring case', () => {
    expect(matchesFilter(base, 'all', 'HOME')).toBe(true)
    expect(matchesFilter(base, 'all', 'accueil')).toBe(true)
    expect(matchesFilter(base, 'all', 'title')).toBe(true)
    expect(matchesFilter(base, 'all', 'profil')).toBe(false)
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
