import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef, useImperativeHandle } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReviewString } from '../api/client'
import { renderApp, REVIEWER } from '../test/renderApp'

// The editor boundary at work: page tests swap CodeMirror for a plain textarea.
vi.mock('../components/editor/TargetEditor', () => ({
  TargetEditor: forwardRef(function FakeEditor(
    props: { value: string; onChange: (v: string) => void; ariaLabel: string },
    ref,
  ) {
    useImperativeHandle(ref, () => ({ focus: () => {}, replaceAll: (text: string) => props.onChange(text) }))
    return <textarea aria-label={props.ariaLabel} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
  }),
}))

afterEach(() => vi.unstubAllGlobals())

const STRINGS: ReviewString[] = [
  { key: 'home.title', source_text: 'Home', source_file: 'en/common.json', value: 'Accueil', machine_translation: 'Accueil', status: 'machine_translated', updated_at: null, approved_at: null, approved_by: null },
  { key: 'dashboard.sets_other', source_text: '{{count}} sets', source_file: 'en/common.json', value: '{{count}} définit', machine_translation: '{{count}} définit', status: 'machine_translated', updated_at: null, approved_at: null, approved_by: null },
  { key: 'login.button', source_text: 'Sign in', source_file: 'en/common.json', value: 'Connexion', machine_translation: 'Connexion', status: 'approved', updated_at: null, approved_at: null, approved_by: 'Marie Dubois' },
]

function setup(path = '/review/fitjournal/fr?view=list') {
  const patches: { key: string; body: unknown }[] = []
  const app = renderApp(path, (url, init) => {
    if (url === '/api/auth/me') return { status: 200, body: REVIEWER }
    if (url === '/api/review/projects') {
      return { status: 200, body: [{ project_id: 'fitjournal', source_locale: 'en', locales: [] }] }
    }
    if (url.startsWith('/api/review/projects/fitjournal/locales/fr/strings?')) {
      return { status: 200, body: { project_id: 'fitjournal', locale: 'fr', total: STRINGS.length, items: STRINGS } }
    }
    const match = url.match(/\/strings\/(.+)$/)
    if (match && init?.method === 'PATCH') {
      const key = decodeURIComponent(match[1])
      const body = JSON.parse(String(init.body)) as { value?: string; approved?: boolean }
      patches.push({ key, body })
      const item = STRINGS.find((s) => s.key === key)!
      const value = body.value ?? item.value
      const status = body.approved ? 'approved' : body.approved === false || value !== item.value ? 'machine_translated' : item.status
      return { status: 200, body: { ...item, value, status, approved_by: status === 'approved' ? 'René Reviewer' : null } }
    }
    return { status: 404 }
  })
  return { ...app, patches }
}

describe('review screen, list view', () => {
  it('lists strings with placeholders, counts and statuses', async () => {
    setup()
    const row = await screen.findByRole('button', { name: /définit/ })
    expect(within(row).getAllByText('{{count}}')).toHaveLength(2)
    expect(within(row).getByText('MT')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /To review/ })).toHaveTextContent('2')
    expect(screen.getByText('3 strings · 2 to review · 1 approved')).toBeInTheDocument()
  })

  it('edits and approves, then opens the next string', async () => {
    const { patches, router } = setup('/review/fitjournal/fr?view=list&key=dashboard.sets_other')
    const editor = await screen.findByLabelText('Translation in French (fr)')
    await userEvent.clear(editor)
    await userEvent.type(editor, '{{{{count}} séries')

    expect(screen.getByText('Changes from DeepL')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Approve and next/ }))

    expect(patches).toEqual([{ key: 'dashboard.sets_other', body: { value: '{{count}} séries', approved: true } }])
    expect(await screen.findByRole('region', { name: 'String 3: login.button' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('?view=list&key=login.button')
  })

  it('approves with Ctrl+Enter and withdraws with Ctrl+Shift+Enter', async () => {
    const { patches } = setup('/review/fitjournal/fr?view=list&key=home.title')
    await screen.findByLabelText('Translation in French (fr)')
    await userEvent.keyboard('{Control>}{Enter}{/Control}')
    expect(patches[0]).toEqual({ key: 'home.title', body: { approved: true } })

    await screen.findByRole('region', { name: 'String 2: dashboard.sets_other' })
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}')
    await screen.findByRole('region', { name: 'String 3: login.button' })
    await userEvent.keyboard('{Control>}{Shift>}{Enter}{/Shift}{/Control}')
    expect(patches[1]).toEqual({ key: 'login.button', body: { approved: false } })
  })

  it('saves an edit, unapproved, when the reviewer moves on', async () => {
    const { patches } = setup('/review/fitjournal/fr?view=list&key=home.title')
    const editor = await screen.findByLabelText('Translation in French (fr)')
    await userEvent.type(editor, ' !')
    await userEvent.click(screen.getByRole('button', { name: /Sign in/ }))
    expect(patches).toEqual([{ key: 'home.title', body: { value: 'Accueil !' } }])
  })

  it('restores DeepL with Ctrl+1 and discards with Esc', async () => {
    setup('/review/fitjournal/fr?view=list&key=home.title')
    const editor = await screen.findByLabelText('Translation in French (fr)')
    await userEvent.type(editor, 'xx')
    await userEvent.keyboard('{Control>}1{/Control}')
    expect(editor).toHaveValue('Accueil')
    await userEvent.type(editor, 'yy')
    await userEvent.keyboard('{Escape}')
    expect(editor).toHaveValue('Accueil')
  })

  it('refuses to approve while a QA error is open', async () => {
    const { patches } = setup('/review/fitjournal/fr?view=list&key=dashboard.sets_other')
    const editor = await screen.findByLabelText('Translation in French (fr)')
    await userEvent.clear(editor)
    await userEvent.type(editor, 'séries')
    expect(screen.getByText('Missing placeholders: {{count}}')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Approve and next/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Fix the errors before approving.')
    expect(patches).toEqual([])
  })

  it('keeps approved strings visible under To review until the filter changes', async () => {
    setup('/review/fitjournal/fr?view=list&status=review&key=home.title')
    await screen.findByLabelText('Translation in French (fr)')
    expect(screen.queryByText('Sign in')).not.toBeInTheDocument()
    await userEvent.keyboard('{Control>}{Enter}{/Control}')
    expect(await screen.findByRole('button', { name: /Home/ })).toHaveTextContent('Approved')
  })
})

describe('review screen, single key view', () => {
  it('is the default view and opens the first string', async () => {
    const { router } = setup('/review/fitjournal/fr')
    expect(await screen.findByRole('region', { name: 'String 1: home.title' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('?key=home.title')
    const list = screen.getByRole('navigation', { name: 'Strings' })
    expect(within(list).getByRole('button', { name: /home\.title/ })).toHaveAttribute('aria-current', 'true')
    expect(within(list).getByText('{{count}} sets')).toBeInTheDocument()
    expect(within(list).getByRole('img', { name: 'Approved' })).toBeInTheDocument()
    expect(within(list).getAllByRole('img', { name: 'Machine translation, not reviewed yet' })).toHaveLength(2)
  })

  it('ticks the string and opens the next one on Ctrl+Enter', async () => {
    const { patches } = setup('/review/fitjournal/fr?key=home.title')
    await screen.findByRole('region', { name: 'String 1: home.title' })
    await userEvent.keyboard('{Control>}{Enter}{/Control}')

    expect(patches[0]).toEqual({ key: 'home.title', body: { approved: true } })
    expect(await screen.findByRole('region', { name: 'String 2: dashboard.sets_other' })).toBeInTheDocument()
    const homeRow = within(screen.getByRole('navigation', { name: 'Strings' })).getByRole('button', { name: /home\.title/ })
    expect(within(homeRow).getByRole('img', { name: 'Approved' })).toBeInTheDocument()
  })

  it('stays on the last string after approving it', async () => {
    setup('/review/fitjournal/fr?key=dashboard.sets_other&status=review')
    await screen.findByRole('region', { name: 'String 2: dashboard.sets_other' })
    await userEvent.keyboard('{Control>}{Enter}{/Control}')
    expect(await screen.findByRole('region', { name: 'String 2: dashboard.sets_other' })).toBeInTheDocument()
  })

  it('updates the symbols in the list while typing', async () => {
    setup('/review/fitjournal/fr?key=dashboard.sets_other')
    const editor = await screen.findByLabelText('Translation in French (fr)')
    const row = within(screen.getByRole('navigation', { name: 'Strings' })).getByRole('button', { name: /sets_other/ })
    expect(within(row).queryByRole('img', { name: /QA/ })).not.toBeInTheDocument()

    await userEvent.clear(editor)
    await userEvent.type(editor, 'séries')
    expect(within(row).getByRole('img', { name: 'QA error: fix before approving' })).toBeInTheDocument()
    expect(within(row).getByRole('img', { name: 'Edited, not approved yet' })).toBeInTheDocument()
  })

  it('switches to the list view and remembers the choice', async () => {
    const { router } = setup('/review/fitjournal/fr')
    await screen.findByRole('region', { name: /String 1/ })
    await userEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(router.state.location.search).toContain('view=list')
    expect(localStorage.getItem('stringherd.reviewView')).toBe('list')
    localStorage.clear()
  })

  it('shows the context panel with an empty screenshot state', async () => {
    setup('/review/fitjournal/fr')
    await screen.findByRole('region', { name: /String 1/ })
    expect(screen.getByText('No screenshot for this string yet.')).toBeInTheDocument()
    expect(screen.getByRole('complementary')).toHaveTextContent('home.title')
  })
})
