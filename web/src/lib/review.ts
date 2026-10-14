import type { ReviewString } from '../api/client'

export type DisplayStatus = 'delivered' | 'approved' | 'edited' | 'mt'
/** "all" is the reviewer's open work: everything not delivered yet. */
export type StatusFilter = 'all' | 'review' | 'approved' | 'delivered'

/**
 * What the reviewer sees: delivered (locked, pullable); approved in this session, waiting for
 * Deliver; edited by a person but not approved yet; or untouched machine translation.
 */
export function displayStatus(s: Pick<ReviewString, 'status' | 'value' | 'machine_translation'>): DisplayStatus {
  if (s.status === 'delivered') return 'delivered'
  if (s.status === 'approved') return 'approved'
  return s.machine_translation !== null && s.value !== s.machine_translation ? 'edited' : 'mt'
}

export function matchesStatus(s: Pick<ReviewString, 'status'>, filter: StatusFilter): boolean {
  switch (filter) {
    case 'all':
      return s.status !== 'delivered'
    case 'review':
      return s.status === 'machine_translated'
    case 'approved':
      return s.status === 'approved'
    case 'delivered':
      return s.status === 'delivered'
  }
}

export function matchesQuery(s: ReviewString, query: string): boolean {
  const q = query.trim().toLocaleLowerCase()
  if (!q) return true
  return [s.key, s.source_text ?? '', s.value].some((field) => field.toLocaleLowerCase().includes(q))
}

export function matchesFilter(s: ReviewString, filter: StatusFilter, query: string): boolean {
  return matchesStatus(s, filter) && matchesQuery(s, query)
}

export function countByFilter(items: Pick<ReviewString, 'status'>[]): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = { all: 0, review: 0, approved: 0, delivered: 0 }
  for (const item of items) {
    for (const filter of Object.keys(counts) as StatusFilter[]) {
      if (matchesStatus(item, filter)) counts[filter] += 1
    }
  }
  return counts
}

/** The key `step` rows away from `current` in the visible list, or null at either end. */
export function neighbourKey(keys: string[], current: string | null, step: 1 | -1): string | null {
  if (keys.length === 0) return null
  if (current === null) return step === 1 ? keys[0] : keys[keys.length - 1]
  const index = keys.indexOf(current)
  if (index === -1) return keys[0]
  return keys[index + step] ?? null
}
