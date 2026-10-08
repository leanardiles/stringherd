import { describe, expect, it } from 'vitest'
import css from './tokens.css?raw'

// Every text and control colour pair in the palette must keep meeting WCAG 2.1 AA.
// If a token changes, this test says which pair broke.
const tokens = Object.fromEntries(
  [...css.matchAll(/--(color-[a-z-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]),
)

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(tokens[a]), luminance(tokens[b])].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const TEXT = 4.5 // normal text
const UI = 3 // controls, focus indicators, progress bars

const pairs: [string, string, number][] = [
  ['color-text', 'color-page', TEXT],
  ['color-text', 'color-surface', TEXT],
  ['color-text-secondary', 'color-page', TEXT],
  ['color-text-secondary', 'color-surface', TEXT],
  ['color-text-secondary', 'color-surface-raised', TEXT],
  ['color-brand', 'color-surface-raised', TEXT],
  ['color-on-primary', 'color-primary', TEXT],
  ['color-on-primary', 'color-primary-hover', TEXT],
  ['color-success-text', 'color-success-bg', TEXT],
  ['color-warning-text', 'color-warning-bg', TEXT],
  ['color-danger-text', 'color-danger-bg', TEXT],
  ['color-danger-inline', 'color-surface', TEXT],
  ['color-neutral-text', 'color-neutral-bg', TEXT],
  ['color-field-border', 'color-field', UI],
  ['color-focus', 'color-page', UI],
  ['color-focus', 'color-surface', UI],
  ['color-success-bar', 'color-divider', UI],
]

describe('palette contrast (WCAG 2.1 AA)', () => {
  it.each(pairs)('%s on %s', (fg, bg, minimum) => {
    expect(tokens[fg], `missing token ${fg}`).toBeDefined()
    expect(tokens[bg], `missing token ${bg}`).toBeDefined()
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(minimum)
  })
})
