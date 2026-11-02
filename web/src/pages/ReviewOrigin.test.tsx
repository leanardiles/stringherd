import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef, useImperativeHandle } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReviewString } from '../api/client'
import { renderApp, REVIEWER } from '../test/renderApp'

// Page tests swap CodeMirror for a plain textarea.
vi.mock('../components/editor/TargetEditor', () => ({
  TargetEditor: forwardRef(function FakeEditor(
    props: { value: string; onChange: (v: string) => void; ariaLabel: string },
    ref,
  ) {
    useImperativeHandle(ref, () => ({ focus: () => {}, replaceAll: props.onChange, insertText: () => {} }))
    return <textarea aria-label={props.ariaLabel} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
  }),
}))

afterEach(() => vi.unstubAllGlobals())

const NONE = { updated_at: null, approved_at: null, approved_by: null, delivered_at: null, delivered_by: null }
const IMPORTED = '2026-11-01T10:00:00Z'

/** Dutch after an import kept for review: two strings from the repository, one DeepL filled in. */
const DUTCH: ReviewString[] = [
  { ...NONE, key: 'nav.home', source_text: 'Home', source_file: 'en/common.json', value: 'Startpagina', machine_translation: 'Startpagina', status: 'machine_translated', origin: 'repository', imported_at: IMPORTED, delivered_value: 'Startpagina', delivered_at: IMPORTED },
  { ...NONE, key: 'workout.manual', source_text: 'Manual', source_file: 'en/common.json', value: 'Handleiding', machine_translation: 'Handleiding', status: 'machine_translated', origin: 'deepl', imported_at: null, delivered_value: null },
  { ...NONE, key: 'nav.saved', source_text: 'Saved', source_file: 'en/common.json', value: 'Opgeslagen', machine_translation: 'Opgeslagen', status: 'delivered', origin: 'repository', imported_at: IMPORTED, delivered_value: 'Opgeslagen', delivered_at: IMPORTED },
]

function setup(path: string) {
  return renderApp(path, (url) => {
    if (url === '/api/auth/me') return { status: 200, body: REVIEWER }
    if (url === '/api/review/projects') {
      return {
        status: 200,
        body: [
          {
            project_id: 'fitjournal',
            name: 'FitJournal',
            source_locale: 'en',
            locales: [{ locale: 'nl', total: 3, machine_translated: 2, approved: 0, delivered: 1, last_delivered_at: null, import_mode: 'review' }],
          },
        ],
      }
    }
    if (url.startsWith('/api/review/projects/fitjournal/locales/nl/strings?')) {
      return { status: 200, body: { project_id: 'fitjournal', locale: 'nl', total: DUTCH.length, items: DUTCH } }
    }
    return { status: 404 }
  })
}

describe('where a translation came from', () => {
  it('calls every unreviewed string To review, with its origin in the tooltip', async () => {
    setup('/review/fitjournal/nl?view=list')
    const home = await screen.findByRole('button', { name: /Startpagina/ })
    expect(within(home).getByText('To review')).toHaveAttribute('title', 'From the repository, not reviewed yet')
    const manual = screen.getByRole('button', { name: /Handleiding/ })
    expect(within(manual).getByText('To review')).toHaveAttribute('title', 'From DeepL, not reviewed yet')
    expect(screen.getByText(/2 from the repository · 1 from DeepL/)).toBeInTheDocument()
  })

  it('filters by origin, and keeps the choice in the address', async () => {
    const { router } = setup('/review/fitjournal/nl?view=list')
    await screen.findByRole('button', { name: /Startpagina/ })
    await userEvent.selectOptions(screen.getByLabelText('Origin'), 'deepl')
    expect(screen.getByRole('button', { name: /Handleiding/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Startpagina/ })).not.toBeInTheDocument()
    expect(router.state.location.search).toContain('origin=deepl')
  })

  it('names the repository as the suggestion and in the details', async () => {
    setup('/review/fitjournal/nl?view=single&key=nav.home')
    const editor = await screen.findByLabelText('Translation in Dutch (nl)')
    expect(screen.getByRole('button', { name: /Insert suggestion 1/ })).toHaveTextContent('Repository')
    await userEvent.clear(editor)
    await userEvent.type(editor, 'Thuis')
    expect(screen.getByText('Changes from the repository')).toBeInTheDocument()

    const details = screen.getByRole('complementary')
    expect(details).toHaveTextContent('Repository, imported')
    // The code has the imported text, the same as before the edit was saved: nothing to repeat.
    expect(details).not.toHaveTextContent('In the code')
  })

  it('says a delivered string was imported, not delivered by someone', async () => {
    setup('/review/fitjournal/nl?view=single&status=delivered&key=nav.saved')
    expect(await screen.findByText(/Imported from the repository on/)).toBeInTheDocument()
  })

  it('counts an imported language as reviewed in the overview', async () => {
    setup('/')
    expect(await screen.findByText('1 of 3 reviewed')).toBeInTheDocument()
  })
})
