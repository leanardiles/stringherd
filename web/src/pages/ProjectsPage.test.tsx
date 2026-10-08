import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ADMIN, renderApp, REVIEWER } from '../test/renderApp'

afterEach(() => vi.unstubAllGlobals())

const PROJECTS = [
  {
    project_id: 'fitjournal',
    source_locale: 'en',
    locales: [
      { locale: 'es-AR', total: 10, machine_translated: 0, approved: 10 },
      { locale: 'fr', total: 240, machine_translated: 128, approved: 112 },
    ],
  },
]

describe('projects page', () => {
  it('lists languages with progress and links to review', async () => {
    renderApp('/', (url) => {
      if (url === '/api/auth/me') return { status: 200, body: ADMIN }
      if (url === '/api/review/projects') return { status: 200, body: PROJECTS }
      return { status: 404 }
    })

    const project = await screen.findByRole('region', { name: 'fitjournal' })
    expect(within(project).getByText('Source: English (en)')).toBeInTheDocument()
    expect(within(project).getByText('112 of 240 approved')).toBeInTheDocument()
    expect(within(project).getByText('128 strings to review')).toBeInTheDocument()
    expect(within(project).getByText('All approved')).toBeInTheDocument()
    expect(within(project).getByRole('progressbar', { name: '47% approved' })).toHaveAttribute('aria-valuenow', '112')
    expect(within(project).getByRole('link', { name: 'Review French (fr)' })).toHaveAttribute('href', '/review/fitjournal/fr')
  })

  it('explains what to do when a reviewer has no assignments', async () => {
    renderApp('/', (url) => {
      if (url === '/api/auth/me') return { status: 200, body: REVIEWER }
      if (url === '/api/review/projects') return { status: 200, body: [] }
      return { status: 404 }
    })
    expect(await screen.findByText(/No languages assigned to you yet/)).toBeInTheDocument()
  })

  it('signs out from the account menu', async () => {
    let signedIn = true
    const { router } = renderApp('/', (url) => {
      if (url === '/api/auth/logout') {
        signedIn = false
        return { status: 204 }
      }
      if (url === '/api/auth/me') return signedIn ? { status: 200, body: REVIEWER } : { status: 401 }
      if (url === '/api/review/projects') return { status: 200, body: PROJECTS }
      return { status: 404 }
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Account menu for René Reviewer' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { name: 'Sign in to Stringherd' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })
})
