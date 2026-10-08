import { formattingLocale } from '../i18n'

/** "French (fr)", "Spanish (Argentina) (es-AR)": language name in the UI language plus the code. */
export function languageLabel(code: string, uiLocale: string = formattingLocale()): string {
  let name: string | undefined
  try {
    name = new Intl.DisplayNames([uiLocale], { type: 'language', languageDisplay: 'standard' }).of(code)
  } catch {
    name = undefined
  }
  return name && name.toLowerCase() !== code.toLowerCase() ? `${name} (${code})` : code
}

export function formatPercent(fraction: number, uiLocale: string = formattingLocale()): string {
  return new Intl.NumberFormat(uiLocale, { style: 'percent', maximumFractionDigits: 0 }).format(fraction)
}
