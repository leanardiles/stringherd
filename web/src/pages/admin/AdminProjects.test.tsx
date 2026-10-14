import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ADMIN, renderApp, REVIEWER } from '../../test/renderApp'

afterEach(() => vi.unstubAllGlobals())

const SHOP = {
  project_id: 'shop',
  name: 'Shop',
  source_locale: 'en',
  target_locales: ['es', 'fr'],
  strings: 2,
  locales: [
    { locale: 'es', total: 0, approved: 0, delivered: 0, last_delivered_at: null, reviewers: [] },
    { locale: 'fr', total: 2, approved: 0, delivered: 1, last_delivered_at: '2026-10-14T10:00:00Z', reviewers: [{ id: 2, name: 'René Reviewer' }] },
  ],
  active_keys: 1,
  created_at: '2026-10-14T10:00:00Z',
}

const KEY = {
  id: 7,
  label: 'Laptop',
  prefix: 'shp_abc123',
  created_at: '2026-10-14T10:00:00Z',
  created_by: 'Ana Admin',
  last_used_at: null,
  revoked_at: null,
}

const DETAIL = { ...SHOP, api_keys: [KEY] }

const SETUP = {
  server_url: 'http://localhost:8100',
  project_id: 'shop',
  deepl_sync_yaml: 'tms:\n  enabled: true\n  server: http://localhost:8100\n  project_id: shop\n',
  commands: 'deepl sync push\n',
}

describe('project administration', () => {
  it('lists projects with languages and keys, reachable from the top bar', async () => {
    renderApp('/', (url) => {
      if (url === '/api/auth/me') return { status: 200, body: ADMIN }
      if (url === '/api/review/projects') return { status: 200, body: [] }
      if (url === '/api/admin/projects') return { status: 200, body: [SHOP] }
      return { status: 404 }
    })

    const nav = await screen.findByRole('navigation', { name: 'Main' })
    await userEvent.click(within(nav).getByRole('link', { name: 'Projects' }))

    const row = (await screen.findByRole('link', { name: 'Shop' })).closest('tr')!
    expect(within(row).getByText('shop')).toBeInTheDocument()
    expect(within(row).getByText('fr · 50%')).toBeInTheDocument()
    expect(within(row).getByText('1 active')).toBeInTheDocument()
  })

  it('is not available to reviewers', async () => {
    renderApp('/admin/projects', (url) => {
      if (url === '/api/auth/me') return { status: 200, body: REVIEWER }
      return { status: 404 }
    })
    expect(await screen.findByText(/This page doesn't exist/)).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })

  it('creates a project with an id suggested from its name', async () => {
    const { router, fetch } = renderApp('/admin/projects', (url, init) => {
      if (url === '/api/auth/me') return { status: 200, body: ADMIN }
      if (url === '/api/admin/projects' && init?.method === 'POST') {
        return { status: 201, body: { ...DETAIL, project_id: 'my-shop', name: 'My Shop', api_keys: [] } }
      }
      if (url === '/api/admin/projects') return { status: 200, body: [] }
      if (url === '/api/admin/projects/my-shop') return { status: 200, body: { ...DETAIL, project_id: 'my-shop', name: 'My Shop' } }
      if (url === '/api/admin/projects/my-shop/setup') return { status: 200, body: SETUP }
      return { status: 404 }
    })

    await userEvent.click(await screen.findByRole('button', { name: 'New project' }))
    const dialog = await screen.findByRole('dialog', { name: 'New project' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'My Shop')
    expect(within(dialog).getByLabelText('Project ID')).toHaveValue('my-shop')
    await userEvent.type(within(dialog).getByLabelText('Target languages'), 'fr, es-AR')
    expect(within(dialog).getByText('French (fr), Spanish (Argentina) (es-AR)')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }))

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/admin/projects/my-shop'))
    const call = fetch.mock.calls.find(([url, init]) => url === '/api/admin/projects' && init?.method === 'POST')
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      project_id: 'my-shop',
      name: 'My Shop',
      source_locale: 'en',
      target_locales: ['fr', 'es-AR'],
    })
  })

  it('refuses a target language that is also the source', async () => {
    const { fetch } = renderApp('/admin/projects', (url) => {
      if (url === '/api/auth/me') return { status: 200, body: ADMIN }
      if (url === '/api/admin/projects') return { status: 200, body: [] }
      return { status: 404 }
    })
    await userEvent.click(await screen.findByRole('button', { name: 'New project' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Shop')
    await userEvent.type(within(dialog).getByLabelText('Target languages'), 'en, fr')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('en is the source language')
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('shows a new key once, and the setup snippet', async () => {
    renderApp('/admin/projects/shop', (url, init) => {
      if (url === '/api/auth/me') return { status: 200, body: ADMIN }
      if (url === '/api/admin/projects/shop/keys' && init?.method === 'POST') {
        return { status: 201, body: { ...KEY, id: 8, label: 'CI', key: 'shp_secret-value' } }
      }
      if (url === '/api/admin/projects/shop') return { status: 200, body: DETAIL }
      if (url === '/api/admin/projects/shop/setup') return { status: 200, body: SETUP }
      if (url === '/api/admin/projects') return { status: 200, body: [SHOP] }
      return { status: 404 }
    })

    expect(await screen.findByRole('heading', { name: 'Shop', level: 1 })).toBeInTheDocument()
    expect(await screen.findByLabelText('the .deepl-sync.yaml block')).toHaveTextContent('project_id: shop')
    const languages = screen.getByRole('region', { name: 'Languages' })
    expect(within(languages).getByRole('link', { name: 'René Reviewer' })).toHaveAttribute('href', '/admin/people/2')
    expect(within(languages).getByText('No reviewer assigned')).toBeInTheDocument()
    expect(within(languages).getByRole('button', { name: 'Remove Spanish (es)' })).toBeInTheDocument()
    expect(within(languages).queryByRole('button', { name: 'Remove French (fr)' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'New key' }))
    const dialog = await screen.findByRole('dialog', { name: 'New API key' })
    await userEvent.type(within(dialog).getByLabelText('Label'), 'CI')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create key' }))

    const issued = await screen.findByRole('dialog', { name: 'Copy your new key' })
    expect(within(issued).getByLabelText('API key')).toHaveTextContent('shp_secret-value')
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Copy your new key' })).toBeInTheDocument()
    await userEvent.click(within(issued).getByRole('button', { name: 'Done' }))
    expect(screen.queryByText('shp_secret-value')).not.toBeInTheDocument()
  })

  it('revokes a key after confirmation', async () => {
    const { fetch } = renderApp('/admin/projects/shop', (url, init) => {
      if (url === '/api/auth/me') return { status: 200, body: ADMIN }
      if (url === '/api/admin/projects/shop/keys/7' && init?.method === 'DELETE') {
        return { status: 200, body: { ...KEY, revoked_at: '2026-10-14T11:00:00Z' } }
      }
      if (url === '/api/admin/projects/shop') return { status: 200, body: DETAIL }
      if (url === '/api/admin/projects/shop/setup') return { status: 200, body: SETUP }
      return { status: 404 }
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Revoke Laptop' }))
    const dialog = await screen.findByRole('dialog', { name: 'Revoke Laptop?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Revoke key' }))
    await vi.waitFor(() =>
      expect(fetch.mock.calls.some(([url, init]) => url === '/api/admin/projects/shop/keys/7' && init?.method === 'DELETE')).toBe(true),
    )
  })
})
