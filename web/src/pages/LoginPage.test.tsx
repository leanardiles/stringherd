import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ADMIN, renderApp } from '../test/renderApp'

afterEach(() => vi.unstubAllGlobals())

describe('sign-in', () => {
  it('sends signed-out visitors to the sign-in page', async () => {
    const { router } = renderApp('/review/fitjournal/fr', () => ({ status: 401, body: { detail: 'Not signed in.' } }))
    expect(await screen.findByRole('heading', { name: 'Sign in to Stringherd' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('signs in and returns to the page the visitor wanted', async () => {
    let signedIn = false
    const { router } = renderApp('/review/fitjournal/fr', (url, init) => {
      if (url === '/api/auth/login') {
        expect(JSON.parse(String(init?.body))).toEqual({ email: 'ana@example.com', password: 'secret-password' })
        signedIn = true
        return { status: 200, body: ADMIN }
      }
      if (url === '/api/auth/me') return signedIn ? { status: 200, body: ADMIN } : { status: 401 }
      if (url === '/api/review/projects') return { status: 200, body: [] }
      if (url.startsWith('/api/review/projects/fitjournal/locales/fr/strings')) {
        return { status: 200, body: { project_id: 'fitjournal', locale: 'fr', total: 0, items: [] } }
      }
      return { status: 404 }
    })

    await userEvent.type(await screen.findByLabelText('Email'), 'ana@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'secret-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('This language has no strings yet.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/review/fitjournal/fr')
  })

  it('shows a clear message for a wrong password', async () => {
    renderApp('/login', (url) =>
      url === '/api/auth/login' ? { status: 401, body: { detail: 'Incorrect email or password.' } } : { status: 401 },
    )
    await userEvent.type(await screen.findByLabelText('Email'), 'ana@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
  })

  it('says when the server cannot be reached', async () => {
    renderApp('/login', (url) => (url === '/api/auth/login' ? { status: 502 } : { status: 401 }))
    await userEvent.type(await screen.findByLabelText('Email'), 'ana@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'whatever')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the Stringherd server")
  })
})
