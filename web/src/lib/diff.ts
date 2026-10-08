import { placeholderPattern } from './placeholders'

export type DiffPart = { op: 'equal' | 'delete' | 'insert'; text: string }

// Words, runs of spaces, single punctuation marks; placeholders stay whole.
const WORD = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu

function tokenize(text: string): string[] {
  const tokens: string[] = []
  let last = 0
  for (const match of text.matchAll(placeholderPattern())) {
    const start = match.index ?? 0
    tokens.push(...(text.slice(last, start).match(WORD) ?? []), match[0])
    last = start + match[0].length
  }
  tokens.push(...(text.slice(last).match(WORD) ?? []))
  return tokens
}

/** Word-level difference from `before` to `after` (longest common subsequence). */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokenize(before)
  const b = tokenize(after)
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const parts: DiffPart[] = []
  const push = (op: DiffPart['op'], text: string) => {
    const previous = parts[parts.length - 1]
    if (previous?.op === op) previous.text += text
    else parts.push({ op, text })
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('equal', a[i])
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push('delete', a[i++])
    } else {
      push('insert', b[j++])
    }
  }
  while (i < a.length) push('delete', a[i++])
  while (j < b.length) push('insert', b[j++])
  return parts
}
