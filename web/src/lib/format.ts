import { formattingLocale } from '../i18n'

/** "14 Oct 2026" in the UI language. */
export function formatDate(iso: string, uiLocale: string = formattingLocale()): string {
  return new Intl.DateTimeFormat(uiLocale, { dateStyle: 'medium' }).format(new Date(iso))
}

/** "14 Oct 2026, 13:05" in the UI language. */
export function formatDateTime(iso: string, uiLocale: string = formattingLocale()): string {
  return new Intl.DateTimeFormat(uiLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

export function formatNumber(value: number, uiLocale: string = formattingLocale()): string {
  return new Intl.NumberFormat(uiLocale).format(value)
}
