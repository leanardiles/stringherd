import '../i18n'
import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { vi } from 'vitest'
import { createQueryClient } from '../api/queries'
import { routes } from '../router'

type Handler = (url: string, init?: RequestInit) => { status: number; body?: unknown }

/** Mounts the whole app at `path` with fetch answered by `handler`. */
export function renderApp(path: string, handler: Handler) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const { status, body } = handler(url, init)
      return new Response(body === undefined ? null : JSON.stringify(body), { status })
    }),
  )
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, fetch: vi.mocked(fetch) }
}

export const ADMIN = { id: 1, email: 'ana@example.com', name: 'Ana Admin', role: 'admin', is_active: true, assignments: [] }
export const REVIEWER = { id: 2, email: 'rene@example.com', name: 'René Reviewer', role: 'reviewer', is_active: true, assignments: [] }
