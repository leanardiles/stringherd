import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderApp, REVIEWER } from '../test/renderApp'

afterEach(() => vi.unstubAllGlobals())

const TEMPORARY = { ...REVIEWER, must_change_password: true }

describe('change password', () => {
  it('sends someone with a temporary password to choose their own, then on to where they were going', async () => {
    let user = TEMPORARY
    const { router, fetch } = renderApp('/review/fitjournal/fr', (url, init) => {
      if (url === '/api/auth/me') return { status: 200, body: user }
      if (url === '/api/auth/password' && init?.method === 'POST') {
        user = { ...REVIEWER }
        return { status: 200, body: user }
      }
      if (url === '/api/review/projects') return { status: 200, body: [] }
      if (url.startsWith('/api/review/projects/fitjournal')) return { status: 200, body: { project_id: 'fitjournal', locale: 'fr', total: 0, items: [] } }
      return { status: 404 }
    })

    expect(await screen.findByRole('heading', { name: 'Choose your own password' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/password')
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Temporary password'), 'temp-password-1')
    await userEvent.type(screen.getByLabelText('New password'), 'my-own-password-42')
    await userEvent.type(screen.getByLabelText('Repeat new password'), 'my-own-password-42')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/review/fitjournal/fr'))
    const call = fetch.mock.calls.find(([url]) => url === '/api/auth/password')
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      current_password: 'temp-password-1',
      new_password: 'my-own-password-42',
    })
  })

  it('checks length and the repeated password before sending', async () => {
    const { fetch } = renderApp('/password', (url) => {
      if (url === '/api/auth/me') return { status: 200, body: TEMPORARY }
      return { status: 404 }
    })

    await userEvent.type(await screen.findByLabelText('Temporary password'), 'temp-password-1')
    await userEvent.type(screen.getByLabelText('New password'), 'my-own-password-42')
    await userEvent.type(screen.getByLabelText('Repeat new password'), 'my-own-password-43')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("The new passwords don't match.")
    expect(fetch.mock.calls.some(([url]) => url === '/api/auth/password')).toBe(false)
  })

  it('explains a wrong current password', async () => {
    renderApp('/password', (url) => {
      if (url === '/api/auth/me') return { status: 200, body: REVIEWER }
      if (url === '/api/auth/password') return { status: 400, body: { detail: 'Current password is incorrect.' } }
      return { status: 404 }
    })

    expect(await screen.findByRole('heading', { name: 'Change your password' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Current password'), 'wrong-password-1')
    await userEvent.type(screen.getByLabelText('New password'), 'my-own-password-42')
    await userEvent.type(screen.getByLabelText('Repeat new password'), 'my-own-password-42')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The current password is incorrect.')
  })
})
