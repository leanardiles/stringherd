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

// ---------- Selection for bulk actions (list view) ----------

/** Delivered strings are locked, so they cannot be part of a bulk action. */
export function isSelectable(s: Pick<ReviewString, 'status'>): boolean {
  return s.status !== 'delivered'
}

/** The keys from `from` to `to` (both included) in list order, for Shift+click. */
export function keyRange(keys: string[], from: string, to: string): string[] {
  const a = keys.indexOf(from)
  const b = keys.indexOf(to)
  if (a === -1 || b === -1) return [to]
  return keys.slice(Math.min(a, b), Math.max(a, b) + 1)
}

export interface SelectionSummary {
  /** In review: Approve sends these. */
  approvable: string[]
  /** Of those, how many the server will skip for a QA error. */
  withErrors: number
  /** Approved, not delivered: Withdraw sends these. */
  withdrawable: string[]
}

export function summarizeSelection(
  items: ReviewString[],
  selected: ReadonlySet<string>,
  hasError: (item: ReviewString) => boolean,
): SelectionSummary {
  const chosen = items.filter((item) => selected.has(item.key))
  const approvable = chosen.filter((item) => item.status === 'machine_translated')
  return {
    approvable: approvable.map((item) => item.key),
    withErrors: approvable.filter(hasError).length,
    withdrawable: chosen.filter((item) => item.status === 'approved').map((item) => item.key),
  }
}
