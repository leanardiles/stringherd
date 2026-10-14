import type { TFunction } from 'i18next'
import { ApiError } from '../api/client'

/**
 * A message for a failed request. The server's own explanation is shown for request
 * errors (4xx), because it names the exact problem ("A project with id 'shop' already
 * exists."); anything else gets a generic message.
 */
export function errorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiError) {
    if (error.unreachable) return t('login.errors.network')
    if (error.status >= 400 && error.status < 500 && error.detail) return error.detail
  }
  return t('errors.generic')
}
