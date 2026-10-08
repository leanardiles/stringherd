// Placeholders and markup inside translatable strings. Kept independent of the
// editor so the same rules drive display chips, character counting and QA checks.
//
// Recognised:  {{count}}  {{count, number}}  $t(key)      i18next
//              <0>…</0>  <1/>  <strong>          i18next Trans / HTML tags
//              %s  %d  %@  %1$s                  printf style
//              {name}                            ICU-style simple argument
const PATTERN = /\{\{[^{}]+\}\}|\$t\([^)]*\)|<\/?[A-Za-z0-9]+\s*\/?>|%(?:\d+\$)?[sd@]|\{[A-Za-z_]\w*\}/g

export type Segment = { kind: 'text'; value: string } | { kind: 'placeholder' | 'tag'; value: string }

function kindOf(token: string): 'placeholder' | 'tag' {
  return token.startsWith('<') ? 'tag' : 'placeholder'
}

export function placeholderPattern(): RegExp {
  return new RegExp(PATTERN.source, 'g')
}

/** Splits a string into plain text, placeholders and tags, in order. */
export function splitPlaceholders(text: string): Segment[] {
  const segments: Segment[] = []
  let last = 0
  for (const match of text.matchAll(placeholderPattern())) {
    const start = match.index ?? 0
    if (start > last) segments.push({ kind: 'text', value: text.slice(last, start) })
    segments.push({ kind: kindOf(match[0]), value: match[0] })
    last = start + match[0].length
  }
  if (last < text.length) segments.push({ kind: 'text', value: text.slice(last) })
  return segments
}

/** Placeholders and tags in a string, in order (for QA and insertion). */
export function findPlaceholders(text: string): string[] {
  return [...text.matchAll(placeholderPattern())].map((m) => m[0])
}

const graphemes = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null

function countGraphemes(text: string): number {
  if (!graphemes) return [...text].length
  let n = 0
  for (const _ of graphemes.segment(text)) n++
  return n
}

/**
 * Characters as a reader sees them (UI plan, decision 9): letters with accents and
 * emoji count as 1, each placeholder counts as 1 (its guaranteed minimum), tags count as 0.
 */
export function countCharacters(text: string): number {
  return splitPlaceholders(text).reduce(
    (total, segment) =>
      total + (segment.kind === 'text' ? countGraphemes(segment.value) : segment.kind === 'placeholder' ? 1 : 0),
    0,
  )
}
