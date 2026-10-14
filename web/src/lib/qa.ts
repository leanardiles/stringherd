import { findPlaceholders, placeholderPattern } from './placeholders'

// Quality checks on one translation. Plain functions, independent of the editor and the UI
// (UI plan, QA checks). Errors block approval; warnings only inform.
//
// The server applies the same rules (server/app/services/qa.py) and refuses to approve a
// string with an error. Both are tested against shared/qa-cases.json, so keep them in step.

export type QaIssue =
  | { code: 'empty'; severity: 'error' }
  | { code: 'placeholdersMissing'; severity: 'error'; items: string[] }
  | { code: 'placeholdersExtra'; severity: 'error'; items: string[] }
  | { code: 'sameAsSource'; severity: 'warning' }
  | { code: 'outerSpaces'; severity: 'warning' }
  | { code: 'numbers'; severity: 'warning'; items: string[] }
  | { code: 'endPunctuation'; severity: 'warning' }
  | { code: 'doubleSpaces'; severity: 'warning' }
  | { code: 'unbalanced'; severity: 'warning' }

export type QaLevel = 'error' | 'warning' | null

const TAG = /<\/?[A-Za-z0-9]+\s*\/?>/
// A number, with thousands or decimal separators: 1,000  1.000  1 000 (no-break spaces)  12.5
const NUMBER = /\d+(?:[.,'  ]\d+| \d{3}(?!\d))*/g
// Ending punctuation and its equivalents in other scripts.
const ENDINGS: Record<string, string> = {
  '.': '.', '?': '?', '!': '!', ':': ':', '…': '…', '。': '.', '？': '?', '！': '!', '：': ':', '؟': '?',
}
const PAIRS: [string, string][] = [['(', ')'], ['[', ']'], ['{', '}'], ['«', '»']]
// Straight quotes, and curly double quotes in any style (“…” „…“ „…”): each kind must be even.
const EVEN_QUOTES = ['"', '“”„']

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

function withoutPlaceholders(text: string): string {
  return text.replace(placeholderPattern(), ' ')
}

function outerSpaces(text: string): string {
  return `${text.match(/^\s*/)?.[0] ?? ''}|${text.match(/\s*$/)?.[0] ?? ''}`
}

const digits = (n: string) => n.replace(/\D/g, '')

/** Numbers that do not match, compared by digits only (1,000 = 1 000, 12.5 = 12,5): missing ones, then extra ones. */
function numberDifferences(source: string, target: string): string[] {
  const s = withoutPlaceholders(source).match(NUMBER) ?? []
  const t = withoutPlaceholders(target).match(NUMBER) ?? []
  const pick = (numbers: string[], wanted: string[]) => {
    const left = [...wanted]
    return numbers.filter((n) => {
      const i = left.indexOf(digits(n))
      if (i === -1) return false
      left.splice(i, 1)
      return true
    })
  }
  return [...pick(s, difference(s.map(digits), t.map(digits))), ...pick(t, difference(t.map(digits), s.map(digits)))]
}

/** Ending punctuation, ignoring trailing tags and spaces; "..." counts as "…". */
function ending(text: string): string | null {
  const stripped = text.replace(new RegExp(`(?:${TAG.source}|\\s)+$`), '')
  if (stripped.endsWith('...')) return '…'
  return ENDINGS[stripped.slice(-1)] ?? null
}

function balanced(text: string): boolean {
  const plain = withoutPlaceholders(text)
  for (const [open, close] of PAIRS) {
    let depth = 0
    for (const char of plain) {
      if (char === open) depth += 1
      else if (char === close && --depth < 0) return false
    }
    if (depth !== 0) return false
  }
  return EVEN_QUOTES.every((quotes) => [...plain].filter((c) => quotes.includes(c)).length % 2 === 0)
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
  if (target === source && /\p{L}{2,}/u.test(withoutPlaceholders(source))) issues.push({ code: 'sameAsSource', severity: 'warning' })
  if (outerSpaces(source) !== outerSpaces(target)) issues.push({ code: 'outerSpaces', severity: 'warning' })
  const numbers = numberDifferences(source, target)
  if (numbers.length) issues.push({ code: 'numbers', severity: 'warning', items: numbers })
  if (ending(source) !== ending(target)) issues.push({ code: 'endPunctuation', severity: 'warning' })
  if (target.includes('  ') && !source.includes('  ')) issues.push({ code: 'doubleSpaces', severity: 'warning' })
  if (balanced(source) && !balanced(target)) issues.push({ code: 'unbalanced', severity: 'warning' })
  return issues
}

export function qaLevel(issues: QaIssue[]): QaLevel {
  if (issues.some((i) => i.severity === 'error')) return 'error'
  return issues.length ? 'warning' : null
}
