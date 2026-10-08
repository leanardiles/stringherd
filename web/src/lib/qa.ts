import { findPlaceholders } from './placeholders'

// Quality checks on one translation. Plain functions, independent of the editor and the UI
// (UI plan, QA checks). Errors block approval; warnings only inform.

export type QaIssue =
  | { code: 'empty'; severity: 'error' }
  | { code: 'placeholdersMissing'; severity: 'error'; items: string[] }
  | { code: 'placeholdersExtra'; severity: 'error'; items: string[] }
  | { code: 'sameAsSource'; severity: 'warning' }
  | { code: 'outerSpaces'; severity: 'warning' }

export type QaLevel = 'error' | 'warning' | null

/** Items of `a` not matched one-for-one in `b` (multiset difference, order-insensitive). */
function difference(a: string[], b: string[]): string[] {
  const remaining = [...b]
  return a.filter((item) => {
    const i = remaining.indexOf(item)
    if (i === -1) return true
    remaining.splice(i, 1)
    return false
  })
}

function outerSpaces(text: string): string {
  return `${text.match(/^\s*/)?.[0] ?? ''}|${text.match(/\s*$/)?.[0] ?? ''}`
}

export function checkTranslation(source: string | null, target: string): QaIssue[] {
  if (target.trim() === '') return [{ code: 'empty', severity: 'error' }]
  if (source === null) return []

  const issues: QaIssue[] = []
  const sourcePlaceholders = findPlaceholders(source)
  const targetPlaceholders = findPlaceholders(target)
  const missing = difference(sourcePlaceholders, targetPlaceholders)
  const extra = difference(targetPlaceholders, sourcePlaceholders)
  if (missing.length) issues.push({ code: 'placeholdersMissing', severity: 'error', items: missing })
  if (extra.length) issues.push({ code: 'placeholdersExtra', severity: 'error', items: extra })

  // Identical text is often fine (brand names, "OK"), so it only warns, and only for real words.
  if (target === source && /\p{L}{2,}/u.test(source)) issues.push({ code: 'sameAsSource', severity: 'warning' })
  if (outerSpaces(source) !== outerSpaces(target)) issues.push({ code: 'outerSpaces', severity: 'warning' })
  return issues
}

export function qaLevel(issues: QaIssue[]): QaLevel {
  if (issues.some((i) => i.severity === 'error')) return 'error'
  return issues.length ? 'warning' : null
}
