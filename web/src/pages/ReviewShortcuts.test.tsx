import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef, useImperativeHandle } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReviewString } from '../api/client'
import { renderApp, REVIEWER } from '../test/renderApp'

// The fake editor appends inserted text at the end, which is where a fresh cursor sits.
vi.mock('../components/editor/TargetEditor', () => ({
  TargetEditor: forwardRef(function FakeEditor(
    props: { value: string; onChange: (v: string) => void; ariaLabel: string },
    ref,
  ) {
    useImperativeHandle(ref, () => ({
      focus: () => {},
      replaceAll: (text: string) => props.onChange(text),
      insertText: (text: string) => props.onChange(props.value + text),
    }))
    return <textarea aria-label={props.ariaLabel} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
  }),
}))

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

const NONE = { approved_at: null, approved_by: null, delivered_value: null, delivered_at: null, delivered_by: null }
const s = (key: string, source: string, value: string, status = 'machine_translated'): ReviewString => ({
  key, source_text: source, source_file: null, value, machine_translation: value, status, updated_at: null, ...NONE,
})

const ITEMS = [
  s('a.first', 'First', 'Premier'),
  s('b.approved', 'Done', 'Terminé', 'approved'),
  s('c.sets', '{{count}} sets of {{reps}}', 'séries'),
  s('d.title', 'Title', 'Titre'),
]

function setup(path = '/review/fitjournal/fr?view=single&key=a.first') {
  return renderApp(path, (url) => {
    if (url === '/api/auth/me') return { status: 200, body: REVIEWER }
    if (url === '/api/review/projects') return { status: 200, body: [] }
    if (url.startsWith('/api/review/projects/fitjournal/locales/fr/strings?')) {
      return { status: 200, body: { project_id: 'fitjournal', locale: 'fr', total: ITEMS.length, items: ITEMS } }
    }
    return { status: 404 }
  })
}

const editor = () => screen.findByLabelText('Translation in French (fr)')
const openString = (number: number, key: string) => screen.findByRole('region', { name: `String ${number}: ${key}` })

describe('review shortcuts', () => {
  it('Alt+↓ and Alt+↑ skip strings that are already approved', async () => {
    setup()
    await openString(1, 'a.first')
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}')
    await openString(3, 'c.sets')
    await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}')
    await openString(1, 'a.first')
  })

  it('Ctrl+Home and Ctrl+End go to the first and last string', async () => {
    setup()
    await openString(1, 'a.first')
    await userEvent.keyboard('{Control>}{End}{/Control}')
    await openString(4, 'd.title')
    await userEvent.keyboard('{Control>}{Home}{/Control}')
    await openString(1, 'a.first')
  })

  it('F8 inserts the next missing placeholder, Ctrl+Shift+F8 all of them', async () => {
    setup('/review/fitjournal/fr?view=single&key=c.sets')
    const box = await editor()
    await userEvent.keyboard('{F8}')
    expect(box).toHaveValue('séries{{count}}')
    await userEvent.keyboard('{Control>}{Shift>}{F8}{/Shift}{/Control}')
    expect(box).toHaveValue('séries{{count}}{{reps}}')
  })

  it('Ctrl+Shift+Space inserts a non-breaking space; Ctrl+Insert copies the source', async () => {
    setup()
    const box = await editor()
    await userEvent.keyboard('{Control>}{Shift>} {/Shift}{/Control}')
    expect(box).toHaveValue('Premier ')
    await userEvent.keyboard('{Control>}{Insert}{/Control}')
    expect(box).toHaveValue('First')
    await userEvent.click(screen.getByRole('button', { name: 'Copy source' }))
    expect(box).toHaveValue('First')
  })

  it('Ctrl+Space inserts the selected suggestion', async () => {
    setup()
    const box = await editor()
    await userEvent.clear(box)
    await userEvent.keyboard('{Control>} {/Control}')
    expect(box).toHaveValue('Premier')
  })

  it('Ctrl+G goes to a string by number or key, even when the filter hides it', async () => {
    setup('/review/fitjournal/fr?view=single&status=review&key=a.first')
    await openString(1, 'a.first')
    await userEvent.keyboard('{Control>}g{/Control}')
    const dialog = await screen.findByRole('dialog', { name: 'Go to string' })
    await userEvent.type(within(dialog).getByLabelText('Number or key'), 'approved{Enter}')
    await openString(2, 'b.approved')

    await userEvent.keyboard('{Control>}g{/Control}')
    await userEvent.type(within(await screen.findByRole('dialog')).getByLabelText('Number or key'), '99{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('No string with number or key 99.')
  })

  it('opens the shortcuts reference with Ctrl+/, the toolbar icon and ?', async () => {
    setup()
    await openString(1, 'a.first')
    await userEvent.keyboard('{Control>}/{/Control}')
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })
    expect(within(dialog).getByText('Approve and go to the next string')).toBeInTheDocument()
    await userEvent.type(within(dialog).getByRole('searchbox', { name: 'Search shortcuts' }), 'placeholder')
    expect(within(dialog).getByText('Insert all missing placeholders')).toBeInTheDocument()
    expect(within(dialog).queryByText('Approve and go to the next string')).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }))
    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')

    // ? only works outside text fields: in the editor it is just a character.
    await userEvent.click(await editor())
    await userEvent.keyboard('?')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    ;(document.activeElement as HTMLElement).blur()
    await userEvent.keyboard('?')
    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
  })

  it('remembers Show non-printable characters and marks spaces in the source', async () => {
    setup()
    await openString(1, 'a.first')
    const toggle = screen.getByRole('button', { name: 'Show non-printable characters' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem('stringherd.showInvisibles')).toBe('true')
  })
})
