import type { ReviewString } from '../api/client'

export type DisplayStatus = 'approved' | 'edited' | 'mt'
export type StatusFilter = 'all' | 'review' | 'approved'

/**
 * What the reviewer sees: approved; edited by a person but not approved yet;
 * or untouched machine translation.
 */
export function displayStatus(s: Pick<ReviewString, 'status' | 'value' | 'machine_translation'>): DisplayStatus {
  if (s.status === 'approved') return 'approved'
  return s.machine_translation !== null && s.value !== s.machine_translation ? 'edited' : 'mt'
}

export function matchesFilter(s: ReviewString, filter: StatusFilter, query: string): boolean {
  if (filter === 'review' && s.status === 'approved') return false
  if (filter === 'approved' && s.status !== 'approved') return false
  const q = query.trim().toLocaleLowerCase()
  if (!q) return true
  return [s.key, s.source_text ?? '', s.value].some((field) => field.toLocaleLowerCase().includes(q))
}

/** The key `step` rows away from `current` in the visible list, or null at either end. */
export function neighbourKey(keys: string[], current: string | null, step: 1 | -1): string | null {
  if (keys.length === 0) return null
  if (current === null) return step === 1 ? keys[0] : keys[keys.length - 1]
  const index = keys.indexOf(current)
  if (index === -1) return keys[0]
  return keys[index + step] ?? null
}
