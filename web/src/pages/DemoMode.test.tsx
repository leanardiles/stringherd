import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ADMIN, REVIEWER, renderApp } from '../test/renderApp'

const DEMO = { resets_utc: ['07:00', '19:00'] }
const DEMO_REVIEWER = { ...REVIEWER, email: 'reviewer@trailhead.example', name: 'Demo Reviewer', demo_account: true }
const BANNER = 'Shared demo: other visitors see your changes. Everything resets at 07:00 and 19:00 UTC.'

describe('the hosted demo', () => {
  it('signs in with one click, without the email form', async () => {
    let signedIn = false
    const { router, fetch } = renderApp('/login', (url) => {
      if (url === '/api/demo') return { status: 200, body: DEMO }
      if (url === '/api/demo/sign-in') {
        signedIn = true
        return { status: 200, body: DEMO_REVIEWER }
      }
      if (url === '/api/auth/me') return signedIn ? { status: 200, body: DEMO_REVIEWER } : { status: 401 }
      if (url === '/api/review/projects') return { status: 200, body: [] }
      return { status: 404 }
    })

    expect(await screen.findByRole('heading', { name: 'Try Stringherd' })).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(BANNER)
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try as admin' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Try as reviewer' }))
    const call = fetch.mock.calls.find(([url]) => url === '/api/demo/sign-in')
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ role: 'reviewer' })
    await screen.findByRole('button', { name: 'Account menu for Demo Reviewer' })
    expect(router.state.location.pathname).toBe('/')
  })

  it('says so when the demo is not ready yet', async () => {
    renderApp('/login', (url) => {
      if (url === '/api/demo') return { status: 200, body: DEMO }
      if (url === '/api/demo/sign-in') return { status: 503, body: { detail: 'The demo is being set up.' } }
      return { status: 401 }
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Try as admin' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The demo is being set up. Try again in a minute.')
  })

  it('keeps the banner on every page and hides Change password for the shared accounts', async () => {
    renderApp('/', (url) => {
      if (url === '/api/demo') return { status: 200, body: DEMO }
      if (url === '/api/auth/me') return { status: 200, body: DEMO_REVIEWER }
      if (url === '/api/review/projects') return { status: 200, body: [] }
      return { status: 404 }
    })
    expect(await screen.findByRole('note')).toHaveTextContent(BANNER)
    await userEvent.click(await screen.findByRole('button', { name: 'Account menu for Demo Reviewer' }))
    expect(await screen.findByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Change password' })).not.toBeInTheDocument()
  })
})

describe('the shared accounts in the admin screens', () => {
  it('explains they cannot be changed and disables their forms', async () => {
    const DEMO_ADMIN = { ...ADMIN, email: 'admin@trailhead.example', name: 'Demo Admin', demo_account: true }
    renderApp(`/admin/people/${DEMO_REVIEWER.id}`, (url) => {
      if (url === '/api/demo') return { status: 200, body: DEMO }
      if (url === '/api/auth/me') return { status: 200, body: DEMO_ADMIN }
      if (url === '/api/admin/users') return { status: 200, body: [DEMO_ADMIN, DEMO_REVIEWER] }
      if (url === '/api/admin/projects') return { status: 200, body: [] }
      return { status: 404 }
    })
    expect(await screen.findByText(/This is a shared demo account/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeDisabled()
    expect(screen.getByLabelText('Name')).toBeDisabled()
  })
})

describe('any other server', () => {
  it('shows the email form, no banner, and Change password', async () => {
    renderApp('/', (url) => {
      if (url === '/api/auth/me') return { status: 200, body: ADMIN }
      if (url === '/api/review/projects') return { status: 200, body: [] }
      return { status: 404 }
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Account menu for Ana Admin' }))
    expect(await screen.findByRole('menuitem', { name: 'Change password' })).toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})
