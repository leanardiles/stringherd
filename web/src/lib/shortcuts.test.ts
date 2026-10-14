import { describe, expect, it } from 'vitest'
import docs from '../../../docs/SHORTCUTS.md?raw'
import { displayKeys, matchShortcut, SHORTCUTS } from './shortcuts'

function press(key: string, init: KeyboardEventInit = {}, target?: HTMLElement): KeyboardEvent {
  const code = /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : key === ' ' ? 'Space' : key
  const event = new KeyboardEvent('keydown', { key, code, bubbles: true, ...init })
  if (target) Object.defineProperty(event, 'target', { value: target })
  return event
}

describe('shortcuts', () => {
  it('never binds the same key twice in one scope', () => {
    const seen = new Map<string, string>()
    for (const s of SHORTCUTS) {
      for (const c of s.combos) {
        const id = `${s.scope}:${c.mod ? 'mod+' : ''}${c.alt ? 'alt+' : ''}${c.shift === true ? 'shift+' : ''}${c.key}`
        expect(seen.get(id), `${s.id} clashes with ${seen.get(id)}`).toBeUndefined()
        seen.set(id, s.id)
      }
    }
  })

  it('matches key presses, with Cmd as Ctrl', () => {
    expect(matchShortcut(press('Enter', { ctrlKey: true }), 'review')).toEqual({ id: 'approveNext' })
    expect(matchShortcut(press('Enter', { metaKey: true, shiftKey: true }), 'review')).toEqual({ id: 'withdraw' })
    expect(matchShortcut(press('3', { ctrlKey: true }), 'review')).toEqual({ id: 'insertSuggestion', digit: 3 })
    expect(matchShortcut(press(' ', { ctrlKey: true, shiftKey: true }), 'review')).toEqual({ id: 'insertNbsp' })
    expect(matchShortcut(press('F', { ctrlKey: true, shiftKey: true }), 'review')).toEqual({ id: 'filterBySelection' })
    expect(matchShortcut(press('Enter'), 'review')).toBeNull()
  })

  it('reads Alt+letter from the key code (macOS gives a symbol)', () => {
    expect(matchShortcut(press('˜', { altKey: true, code: 'KeyN' }), 'review')).toEqual({ id: 'contextPanel' })
  })

  it('opens the reference with ? only outside text fields', () => {
    expect(matchShortcut(press('?', { shiftKey: true }, document.body), 'app')).toEqual({ id: 'showShortcuts' })
    expect(matchShortcut(press('?', { shiftKey: true }, document.createElement('input')), 'app')).toBeNull()
    expect(matchShortcut(press('/', { ctrlKey: true }, document.createElement('input')), 'app')).toEqual({ id: 'showShortcuts' })
  })

  it('shows macOS symbols on a Mac', () => {
    expect(displayKeys('Ctrl+Shift+Enter', true)).toBe('⌘⇧Enter')
    expect(displayKeys('Ctrl+Alt+→', true)).toBe('⌘⌥→')
    expect(displayKeys('Ctrl+1 … Ctrl+9', true)).toBe('⌘1 … ⌘9')
    expect(displayKeys('Ctrl+Enter', false)).toBe('Ctrl+Enter')
  })

  it('is documented in docs/SHORTCUTS.md', () => {
    for (const s of SHORTCUTS) {
      for (const keys of s.keys) expect(docs, `${keys} (${s.id}) missing from docs/SHORTCUTS.md`).toContain(`\`${keys}\``)
    }
  })
})
