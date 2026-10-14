import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef, useImperativeHandle } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReviewString } from '../api/client'
import { ADMIN, renderApp, REVIEWER } from '../test/renderApp'

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

const NONE = { approved_at: null, approved_by: null, delivered_value: null, delivered_at: null, delivered_by: null }

function string(key: string, value: string, status: string, extra: Partial<ReviewString> = {}): ReviewString {
  return {
    key, source_text: key, source_file: null, value, machine_translation: value, status, updated_at: null, ...NONE, ...extra,
  }
}

const DELIVERED = { delivered_value: 'Accueil', delivered_at: '2026-10-14T10:00:00Z', delivered_by: 'René Reviewer' }

function setup(path: string, user = REVIEWER) {
  let items: ReviewString[] = [
    string('home.title', 'Accueil', 'delivered', { approved_by: 'René Reviewer', ...DELIVERED }),
    string('login.button', 'Connexion', 'approved', { approved_by: 'René Reviewer' }),
    string('profile.save', 'Enregistrer', 'approved', { approved_by: 'René Reviewer' }),
    string('profile.title', 'Profil', 'machine_translated'),
  ]
  const calls: string[] = []
  const app = renderApp(path, (url, init) => {
    if (url === '/api/auth/me') return { status: 200, body: user }
    if (url === '/api/review/projects') return { status: 200, body: [] }
    if (url.startsWith('/api/review/projects/fitjournal/locales/fr/strings?')) {
      return { status: 200, body: { project_id: 'fitjournal', locale: 'fr', total: items.length, items } }
    }
    if (url === '/api/review/projects/fitjournal/locales/fr/deliver' && init?.method === 'POST') {
      calls.push('deliver')
      const count = items.filter((i) => i.status === 'approved').length
      items = items.map((i) => (i.status === 'approved' ? { ...i, status: 'delivered', delivered_value: i.value } : i))
      return { status: 200, body: { locale: 'fr', delivered: count, not_approved: 1, delivered_at: '2026-10-14T12:00:00Z' } }
    }
    const reopen = url.match(/\/strings\/(.+)\/reopen$/)
    if (reopen && init?.method === 'POST') {
      calls.push(`reopen ${decodeURIComponent(reopen[1])}`)
      items = items.map((i) => (i.key === decodeURIComponent(reopen[1]) ? { ...i, status: 'approved' } : i))
      return { status: 200, body: items.find((i) => i.key === decodeURIComponent(reopen[1])) }
    }
    return { status: 404 }
  })
  return { ...app, calls }
}

describe('deliver', () => {
  it('keeps delivered strings out of the open list and counts what is waiting', async () => {
    setup('/review/fitjournal/fr?view=list')
    expect(await screen.findByRole('button', { name: /Connexion/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /home\.title/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Open/ })).toHaveTextContent('3')
    expect(screen.getByRole('button', { name: /^Delivered/ })).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: 'Deliver 2 strings' })).toBeEnabled()
  })

  it('delivers after confirmation and says what happened', async () => {
    const { calls } = setup('/review/fitjournal/fr?view=list')
    await userEvent.click(await screen.findByRole('button', { name: 'Deliver 2 strings' }))

    const dialog = await screen.findByRole('dialog', { name: 'Deliver French (fr)?' })
    expect(dialog).toHaveTextContent('2 approved strings go to the repository')
    expect(dialog).toHaveTextContent("1 string isn't approved yet")
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deliver 2 strings' }))

    expect(await screen.findByText(/Delivered 2 strings/)).toBeInTheDocument()
    expect(calls).toEqual(['deliver'])
    expect(await screen.findByRole('button', { name: 'Deliver' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Connexion/ })).not.toBeInTheDocument()
  })

  it('points to delivered strings that match a search', async () => {
    setup('/review/fitjournal/fr?view=list&q=accueil')
    expect(await screen.findByText('1 delivered string also matches.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show delivered' }))
    expect(await screen.findByRole('button', { name: /home\.title/ })).toBeInTheDocument()
  })

  it('shows a delivered string read-only, and reviewers cannot reopen it', async () => {
    setup('/review/fitjournal/fr?status=delivered&key=home.title')
    expect(await screen.findByText('Delivered and locked')).toBeInTheDocument()
    expect(screen.getByText(/ask an admin to reopen it/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Translation in French (fr)')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Approve and next/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reopen' })).not.toBeInTheDocument()
  })

  it('lets an admin reopen a delivered string', async () => {
    const { calls } = setup('/review/fitjournal/fr?status=delivered&key=home.title', ADMIN)
    await userEvent.click(await screen.findByRole('button', { name: 'Reopen' }))
    expect(calls).toEqual(['reopen home.title'])
    expect(await screen.findByLabelText('Translation in French (fr)')).toBeInTheDocument()
    expect(screen.getByRole('complementary')).toHaveTextContent('In the code')
  })
})
