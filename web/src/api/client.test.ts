import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './client'

afterEach(() => vi.unstubAllGlobals())

function respond(status: number, body?: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status })))
}

describe('api', () => {
  it('returns parsed JSON', async () => {
    respond(200, { id: 1 })
    await expect(api('/api/auth/me')).resolves.toEqual({ id: 1 })
  })

  it('sends JSON bodies with the right header', async () => {
    respond(200, {})
    await api('/api/auth/login', { method: 'POST', json: { email: 'a@b.c' } })
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(init?.body).toBe('{"email":"a@b.c"}')
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' })
    expect(init?.credentials).toBe('same-origin')
  })

  it('turns error responses into ApiError with the server detail', async () => {
    respond(401, { detail: 'Not signed in.' })
    await expect(api('/api/auth/me')).rejects.toMatchObject({ status: 401, detail: 'Not signed in.' })
  })

  it('marks network failures and empty 5xx as unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const error = await api('/x').catch((e: ApiError) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).unreachable).toBe(true)

    respond(502)
    expect(((await api('/x').catch((e: ApiError) => e)) as ApiError).unreachable).toBe(true)
  })

  it('returns undefined for 204', async () => {
    respond(204)
    await expect(api('/api/auth/logout', { method: 'POST' })).resolves.toBeUndefined()
  })
})
