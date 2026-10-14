import type { components } from './schema'

// Types generated from the server's OpenAPI schema (npm run api:types).
export type User = components['schemas']['UserOut']
export type ReviewProject = components['schemas']['ReviewProject']
export type ReviewLocale = components['schemas']['ReviewLocale']
export type ReviewString = components['schemas']['ReviewString']
export type ReviewStringPage = components['schemas']['ReviewStringPage']
export type ReviewEdit = components['schemas']['ReviewEdit']
export type DeliveryResult = components['schemas']['DeliveryResult']
export type ProjectAdmin = components['schemas']['ProjectAdminOut']
export type ProjectAdminDetail = components['schemas']['ProjectAdminDetail']
export type ProjectCreate = components['schemas']['ProjectCreate']
export type ProjectUpdate = components['schemas']['ProjectUpdate']
export type ProjectLocaleAdmin = components['schemas']['ProjectLocaleOut']
export type ApiKey = components['schemas']['ApiKeyOut']
export type ApiKeyIssued = components['schemas']['ApiKeyIssued']
export type ProjectSetup = components['schemas']['ProjectSetup']
export type UserCreate = components['schemas']['UserCreate']
export type UserCreated = components['schemas']['UserCreated']
export type UserUpdate = components['schemas']['UserUpdate']
export type TemporaryPassword = components['schemas']['TemporaryPassword']
export type PasswordChange = components['schemas']['PasswordChange']

/** The server's answer while a user still has a temporary password (app/security.py). */
export const PASSWORD_CHANGE_REQUIRED = 'Choose a new password before continuing.'

/** An API call that failed. status 0 means the server could not be reached. */
export class ApiError extends Error {
  readonly status: number
  readonly detail: string | null

  constructor(status: number, detail: string | null) {
    super(detail ?? `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }

  get unreachable(): boolean {
    // The development proxy answers 5xx without a body when the server is down.
    return this.status === 0 || (this.status >= 500 && this.detail === null)
  }
}

async function readDetail(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object' && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail
      if (typeof detail === 'string') return detail
      if (Array.isArray(detail)) return detail.map((d) => (d as { msg?: string }).msg ?? '').join('; ')
    }
  } catch {
    // not JSON
  }
  return null
}

/** Same-origin JSON request; the session cookie travels automatically. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init
  let response: Response
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...rest,
      headers: { Accept: 'application/json', ...(json !== undefined && { 'Content-Type': 'application/json' }), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    })
  } catch {
    throw new ApiError(0, null)
  }
  if (!response.ok) throw new ApiError(response.status, await readDetail(response))
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
