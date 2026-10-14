import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReviewString } from '../api/client'
import { renderApp, REVIEWER } from '../test/renderApp'

afterEach(() => vi.unstubAllGlobals())

const NONE = { approved_at: null, approved_by: null, delivered_value: null, delivered_at: null, delivered_by: null }

function string(key: string, source: string, value: string, status = 'machine_translated'): ReviewString {
  return { key, source_text: source, source_file: null, value, machine_translation: value, status, updated_at: null, ...NONE }
}

function setup(path = '/review/fitjournal/fr?view=list') {
  let items = [
    string('a.save', 'Save', 'Enregistrer'),
    string('b.sets', '{{count}} sets', 'séries'), // QA error: missing placeholder
    string('c.cancel', 'Cancel', 'Annuler'),
    string('d.done', 'Done', 'Terminé', 'approved'),
    string('e.home', 'Home', 'Accueil', 'delivered'),
  ]
  const calls: { url: string; keys: string[] }[] = []
  const app = renderApp(path, (url, init) => {
    if (url === '/api/auth/me') return { status: 200, body: REVIEWER }
    if (url === '/api/review/projects') return { status: 200, body: [] }
    if (url.startsWith('/api/review/projects/fitjournal/locales/fr/strings?')) {
      return { status: 200, body: { project_id: 'fitjournal', locale: 'fr', total: items.length, items } }
    }
    if (url.endsWith('/strings/approve') && init?.method === 'POST') {
      const { keys } = JSON.parse(String(init.body)) as { keys: string[] }
      calls.push({ url: 'approve', keys })
      const skipped: string[] = keys.filter((k) => k === 'b.sets')
      items = items.map((i) => (keys.includes(i.key) && !skipped.includes(i.key) ? { ...i, status: 'approved' } : i))
      return {
        status: 200,
        body: {
          approved: keys.length - skipped.length,
          already_approved: 0,
          not_found: [],
          skipped: skipped.map((key) => ({ key, issues: [{ code: 'placeholdersMissing', severity: 'error', items: ['{{count}}'] }] })),
        },
      }
    }
    if (url.endsWith('/strings/withdraw') && init?.method === 'POST') {
      const { keys } = JSON.parse(String(init.body)) as { keys: string[] }
      calls.push({ url: 'withdraw', keys })
      return { status: 200, body: { withdrawn: keys.length, not_approved: 0, not_found: [] } }
    }
    return { status: 404 }
  })
  return { ...app, calls }
}

const box = (key: string) => screen.getByRole('checkbox', { name: `Select ${key}` })

describe('bulk actions in the list view', () => {
  it('selects all shown strings except delivered ones', async () => {
    setup('/review/fitjournal/fr?view=list&status=delivered')
    await screen.findByRole('button', { name: /e\.home/ })
    expect(box('e.home')).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Select all shown strings' })).toBeDisabled()
  })

  it('approves the valid ones, reports the rest and keeps them selected', async () => {
    const { calls } = setup()
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select all shown strings' }))

    const bar = screen.getByRole('region', { name: 'Selected strings' })
    expect(bar).toHaveTextContent('4 selected')
    expect(bar).toHaveTextContent('1 has QA errors and will be skipped')
    await userEvent.click(within(bar).getByRole('button', { name: 'Approve 2 strings' }))

    // All three go to the server, which skips the one with an error and says so.
    expect(calls).toEqual([{ url: 'approve', keys: ['a.save', 'b.sets', 'c.cancel'] }])
    expect(await screen.findByText(/2 strings approved\. 1 skipped: fix the QA errors first/)).toBeInTheDocument()
    expect(box('b.sets')).toBeChecked()
    expect(box('a.save')).not.toBeChecked()
    expect(within(screen.getByRole('region', { name: 'Selected strings' })).getByRole('button', { name: 'Approve 0 strings' })).toBeDisabled()
    // Approved rows stay in view under the current filter until it changes.
    expect(within(screen.getByRole('button', { name: /a\.save/ })).getByText('Approved')).toBeInTheDocument()
  })

  it('withdraws selected approvals', async () => {
    const { calls } = setup()
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select d.done' }))
    const bar = screen.getByRole('region', { name: 'Selected strings' })
    expect(within(bar).queryByRole('button', { name: /^Approve/ })).not.toBeInTheDocument()
    await userEvent.click(within(bar).getByRole('button', { name: 'Withdraw 1 approval' }))
    expect(calls).toEqual([{ url: 'withdraw', keys: ['d.done'] }])
    expect(await screen.findByText('1 approval withdrawn.')).toBeInTheDocument()
  })

  it('selects a range with Shift+click', async () => {
    setup()
    const user = userEvent.setup() // keeps Shift held between calls
    await user.click(await screen.findByRole('checkbox', { name: 'Select a.save' }))
    await user.keyboard('{Shift>}')
    await user.click(box('c.cancel'))
    await user.keyboard('{/Shift}')
    expect(box('b.sets')).toBeChecked()
    expect(box('d.done')).not.toBeChecked()
    expect(screen.getByRole('region', { name: 'Selected strings' })).toHaveTextContent('3 selected')
  })

  it('clears the selection when the filter or search changes', async () => {
    setup()
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select a.save' }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search strings' }), 'x')
    expect(screen.queryByRole('region', { name: 'Selected strings' })).not.toBeInTheDocument()
  })
})
