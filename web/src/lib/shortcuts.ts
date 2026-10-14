// Every keyboard shortcut in one list (UI plan, keyboard shortcuts). The review screen's key
// handling and the shortcuts reference both read it, so a shortcut can't work without being
// listed, or be listed without working. docs/SHORTCUTS.md mirrors it (checked by a test).

export type ShortcutId =
  | 'approveNext'
  | 'withdraw'
  | 'discard'
  | 'copySource'
  | 'insertSuggestion'
  | 'insertSelectedSuggestion'
  | 'previousSuggestion'
  | 'nextSuggestion'
  | 'insertNextPlaceholder'
  | 'insertAllPlaceholders'
  | 'insertNbsp'
  | 'undo'
  | 'redo'
  | 'previousString'
  | 'nextString'
  | 'previousToReview'
  | 'nextToReview'
  | 'firstString'
  | 'lastString'
  | 'goTo'
  | 'filterBySelection'
  | 'previousPane'
  | 'nextPane'
  | 'contextPanel'
  | 'showShortcuts'

export type ShortcutGroup = 'review' | 'edit' | 'insert' | 'navigate' | 'view'

/**
 * Who handles it: the review screen (capture phase, before the editor sees the key), the
 * editor itself (undo, arrows at the edges), or the app shell (the reference, anywhere).
 */
export type ShortcutScope = 'review' | 'editor' | 'app'

interface Combo {
  /** KeyboardEvent.key, letters lower case; 'Space' for the space bar. */
  key: string
  /** Ctrl on Windows and Linux, Cmd on macOS. */
  mod?: boolean
  /** true, false, or 'any' for keys whose character needs Shift on some layouts (/ and ?). */
  shift?: boolean | 'any'
  alt?: boolean
  /** Only when the focus is not in a text field (for plain keys like ?). */
  outsideFields?: boolean
}

export interface Shortcut {
  id: ShortcutId
  group: ShortcutGroup
  scope: ShortcutScope
  /** As shown to the user, Windows style; macOS symbols are derived. Alternatives in separate entries. */
  keys: string[]
  combos: Combo[]
}

const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

export const SHORTCUTS: Shortcut[] = [
  // Review
  { id: 'approveNext', group: 'review', scope: 'review', keys: ['Ctrl+Enter'], combos: [{ key: 'Enter', mod: true }] },
  { id: 'withdraw', group: 'review', scope: 'review', keys: ['Ctrl+Shift+Enter'], combos: [{ key: 'Enter', mod: true, shift: true }] },
  { id: 'discard', group: 'review', scope: 'review', keys: ['Esc'], combos: [{ key: 'Escape' }] },
  // Edit
  { id: 'copySource', group: 'edit', scope: 'review', keys: ['Ctrl+Insert'], combos: [{ key: 'Insert', mod: true }] },
  { id: 'undo', group: 'edit', scope: 'editor', keys: ['Ctrl+Z'], combos: [] },
  { id: 'redo', group: 'edit', scope: 'editor', keys: ['Ctrl+Shift+Z'], combos: [] },
  // Insert
  {
    id: 'insertSuggestion',
    group: 'insert',
    scope: 'review',
    keys: ['Ctrl+1 … Ctrl+9'],
    combos: digits.map((key) => ({ key, mod: true })),
  },
  { id: 'insertSelectedSuggestion', group: 'insert', scope: 'review', keys: ['Ctrl+Space'], combos: [{ key: 'Space', mod: true }] },
  { id: 'previousSuggestion', group: 'insert', scope: 'review', keys: ['Ctrl+↑'], combos: [{ key: 'ArrowUp', mod: true }] },
  { id: 'nextSuggestion', group: 'insert', scope: 'review', keys: ['Ctrl+↓'], combos: [{ key: 'ArrowDown', mod: true }] },
  { id: 'insertNextPlaceholder', group: 'insert', scope: 'review', keys: ['F8'], combos: [{ key: 'F8' }] },
  { id: 'insertAllPlaceholders', group: 'insert', scope: 'review', keys: ['Ctrl+Shift+F8'], combos: [{ key: 'F8', mod: true, shift: true }] },
  { id: 'insertNbsp', group: 'insert', scope: 'review', keys: ['Ctrl+Shift+Space'], combos: [{ key: 'Space', mod: true, shift: true }] },
  // Navigate
  { id: 'previousString', group: 'navigate', scope: 'editor', keys: ['↑'], combos: [] },
  { id: 'nextString', group: 'navigate', scope: 'editor', keys: ['↓'], combos: [] },
  { id: 'previousToReview', group: 'navigate', scope: 'review', keys: ['Alt+↑'], combos: [{ key: 'ArrowUp', alt: true }] },
  { id: 'nextToReview', group: 'navigate', scope: 'review', keys: ['Alt+↓'], combos: [{ key: 'ArrowDown', alt: true }] },
  { id: 'firstString', group: 'navigate', scope: 'review', keys: ['Ctrl+Home'], combos: [{ key: 'Home', mod: true }] },
  { id: 'lastString', group: 'navigate', scope: 'review', keys: ['Ctrl+End'], combos: [{ key: 'End', mod: true }] },
  { id: 'goTo', group: 'navigate', scope: 'review', keys: ['Ctrl+G'], combos: [{ key: 'g', mod: true }] },
  { id: 'filterBySelection', group: 'navigate', scope: 'review', keys: ['Ctrl+Shift+F'], combos: [{ key: 'f', mod: true, shift: true }] },
  // View
  { id: 'previousPane', group: 'view', scope: 'review', keys: ['Ctrl+Alt+←'], combos: [{ key: 'ArrowLeft', mod: true, alt: true }] },
  { id: 'nextPane', group: 'view', scope: 'review', keys: ['Ctrl+Alt+→'], combos: [{ key: 'ArrowRight', mod: true, alt: true }] },
  { id: 'contextPanel', group: 'view', scope: 'review', keys: ['Alt+N'], combos: [{ key: 'n', alt: true }] },
  {
    id: 'showShortcuts',
    group: 'view',
    scope: 'app',
    keys: ['Ctrl+/', '?'],
    combos: [
      { key: '/', mod: true, shift: 'any' },
      { key: '?', shift: 'any', outsideFields: true },
    ],
  },
]

export const GROUPS: ShortcutGroup[] = ['review', 'edit', 'insert', 'navigate', 'view']

export function shortcut(id: ShortcutId): Shortcut {
  return SHORTCUTS.find((s) => s.id === id)!
}

function eventKey(event: KeyboardEvent): string {
  if (event.key === ' ' || event.code === 'Space') return 'Space'
  // Alt+letter gives special characters on macOS (Alt+N is ˜), so letters come from the key code.
  if (/^Key[A-Z]$/.test(event.code) && (event.altKey || event.key.length !== 1)) return event.code.slice(3).toLowerCase()
  return event.key.length === 1 ? event.key.toLowerCase() : event.key
}

function inTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function matches(event: KeyboardEvent, combo: Combo): boolean {
  const mod = event.ctrlKey || event.metaKey
  if (mod !== Boolean(combo.mod) || event.altKey !== Boolean(combo.alt)) return false
  if (combo.shift !== 'any' && event.shiftKey !== Boolean(combo.shift)) return false
  if (combo.outsideFields && inTextField(event.target)) return false
  return eventKey(event) === combo.key
}

/** The shortcut a key press means within one scope, with the digit for Ctrl+1 … Ctrl+9. */
export function matchShortcut(event: KeyboardEvent, scope: ShortcutScope): { id: ShortcutId; digit?: number } | null {
  for (const s of SHORTCUTS) {
    if (s.scope !== scope) continue
    const combo = s.combos.find((c) => matches(event, c))
    if (combo) return s.id === 'insertSuggestion' ? { id: s.id, digit: Number(combo.key) } : { id: s.id }
  }
  return null
}

export function isMac(): boolean {
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? ''
  return /mac|iphone|ipad/i.test(platform)
}

/** "Ctrl+Shift+Enter" as shown on this computer: unchanged, or ⌘⇧Enter on macOS. */
export function displayKeys(keys: string, mac: boolean = isMac()): string {
  if (!mac) return keys
  return keys
    .replace(/Ctrl\+/g, '⌘')
    .replace(/Alt\+/g, '⌥')
    .replace(/Shift\+/g, '⇧')
    .replace(/Ctrl/g, '⌘')
}
