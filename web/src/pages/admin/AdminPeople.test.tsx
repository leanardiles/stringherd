import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ADMIN, renderApp, REVIEWER } from '../../test/renderApp'

afterEach(() => vi.unstubAllGlobals())

const MARIE = {
  ...REVIEWER,
  id: 3,
  email: 'marie@example.com',
  name: 'Marie',
  must_change_password: true,
  assignments: [{ project_id: 'shop', locale: 'fr' }],
}

const SHOP = {
  project_id: 'shop',
  name: 'Shop',
  source_locale: 'en',
  target_locales: ['es', 'fr'],
  strings: 0,
  locales: [],
  active_keys: 0,
  created_at: null,
}

describe('people administration', () => {
  it('lists people with role, languages and status', async () => {
    renderApp('/admin/people', (url) => {
      if (url === '/api/auth/me') return { status: 200, body: ADMIN }
      if (url === '/api/admin/users') return { status: 200, body: [ADMIN, MARIE] }
      return { status: 404 }
    })

    const marie = (await screen.findByRole('link', { name: 'Marie' })).closest('tr')!
    expect(within(marie).getByText('shop · fr')).toBeInTheDocument()
    expect(within(marie).getByText('Temporary password')).toBeInTheDocument()
    expect(within(marie).getByText('Never')).toBeInTheDocument()
    const ana = screen.getByRole('link', { name: 'Ana Admin' }).closest('tr')!
    expect(within(ana).getByText('All (admin)')).toBeInTheDocument()
  })

  it('adds a person and shows the generated temporary password once', async () => {
    const { fetch } = renderApp('/admin/people', (url, init) => {
      if (url === '/api/auth/me') return { status: 200, body: ADMIN }
      if (url === '/api/admin/users' && init?.method === 'POST') {
        return { status: 201, body: { ...MARIE, assignments: [], temporary_password: 'Xy7-generated-pw' } }
      }
      if (url === '/api/admin/users') return { status: 200, body: [ADMIN] }
      return { status: 404 }
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Add person' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add person' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Marie')
    await userEvent.type(within(dialog).getByLabelText('Email'), 'marie@example.com')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add person' }))

    const created = await screen.findByRole('dialog', { name: 'Marie can sign in now' })
    expect(within(created).getByLabelText('Temporary password')).toHaveTextContent('Xy7-generated-pw')
    expect(within(created).getByRole('button', { name: 'Assign languages' })).toBeInTheDocument()
    const call = fetch.mock.calls.find(([url, init]) => url === '/api/admin/users' && init?.method === 'POST')
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ name: 'Marie', email: 'marie@example.com', role: 'reviewer' })
  })

  it('assigns one of the project languages that is not assigned yet', async () => {
    const { fetch } = renderApp('/admin/people/3', (url, init) => {
      if (url === '/api/auth/me') return { status: 200, body: ADMIN }
      if (url === '/api/admin/users/3/assignments' && init?.method === 'POST') return { status: 201, body: MARIE }
      if (url === '/api/admin/users') return { status: 200, body: [ADMIN, MARIE] }
      if (url === '/api/admin/projects') return { status: 200, body: [SHOP] }
      return { status: 404 }
    })

    const section = await screen.findByRole('region', { name: 'Languages' })
    await within(section).findByRole('option', { name: 'Shop' })
    expect(within(section).getByRole('button', { name: 'Remove Shop, French (fr)' })).toBeInTheDocument()
    await userEvent.selectOptions(within(section).getByLabelText('Project'), 'shop')
    const languages = within(section).getByLabelText('Language')
    expect(within(languages).queryByRole('option', { name: 'French (fr)' })).not.toBeInTheDocument()
    await userEvent.selectOptions(languages, 'es')
    await userEvent.click(within(section).getByRole('button', { name: 'Assign' }))

    await vi.waitFor(() => {
      const call = fetch.mock.calls.find(([url]) => url === '/api/admin/users/3/assignments')
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ project_id: 'shop', locale: 'es' })
    })
  })

  it('resets a password after confirmation and shows the new one once', async () => {
    renderApp('/admin/people/3', (url, init) => {
      if (url === '/api/auth/me') return { status: 200, body: ADMIN }
      if (url === '/api/admin/users/3/reset-password' && init?.method === 'POST') {
        return { status: 200, body: { temporary_password: 'new-temp-pass-9' } }
      }
      if (url === '/api/admin/users') return { status: 200, body: [ADMIN, MARIE] }
      if (url === '/api/admin/projects') return { status: 200, body: [SHOP] }
      return { status: 404 }
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Reset password' }))
    const confirm = await screen.findByRole('dialog', { name: "Reset Marie's password?" })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Reset password' }))
    const done = await screen.findByRole('dialog', { name: 'New temporary password' })
    expect(within(done).getByLabelText('Temporary password')).toHaveTextContent('new-temp-pass-9')
  })

  it('does not let admins demote, deactivate or reset themselves', async () => {
    renderApp('/admin/people/1', (url) => {
      if (url === '/api/auth/me') return { status: 200, body: ADMIN }
      if (url === '/api/admin/users') return { status: 200, body: [ADMIN, MARIE] }
      if (url === '/api/admin/projects') return { status: 200, body: [SHOP] }
      return { status: 404 }
    })

    expect(await screen.findByLabelText('Role')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Reset password' })).not.toBeInTheDocument()
  })
})
