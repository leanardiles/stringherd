import { formattingLocale } from '../i18n'

export interface LanguageParts {
  /** The language in the UI language, with its script when the code has one: "Spanish", "Simplified Chinese". */
  name: string
  /** The region, when the code has one: "Latin America" for es-419, "Argentina" for es-AR. */
  region?: string
  code: string
}

/**
 * A language code split for display: the language and its code on one line, the region below it,
 * so every language reads the same way ("Spanish (es-419)", then "Latin America"). An unknown or
 * invalid code comes back as its own name.
 */
export function languageParts(code: string, uiLocale: string = formattingLocale()): LanguageParts {
  try {
    const locale = new Intl.Locale(code)
    const base = locale.script ? `${locale.language}-${locale.script}` : locale.language
    const name = new Intl.DisplayNames([uiLocale], { type: 'language', languageDisplay: 'dialect' }).of(base)
    if (!name || name.toLowerCase() === base.toLowerCase()) return { name: code, code }
    const region = locale.region ? new Intl.DisplayNames([uiLocale], { type: 'region' }).of(locale.region) : undefined
    return { name, region: region && region !== locale.region ? region : undefined, code }
  } catch {
    return { name: code, code }
  }
}

/** The same on one line, for titles, labels and lists: "French (fr)", "Spanish (es-419) · Latin America". */
export function languageLabel(code: string, uiLocale: string = formattingLocale()): string {
  const { name, region } = languageParts(code, uiLocale)
  if (name === code) return code
  return region ? `${name} (${code}) · ${region}` : `${name} (${code})`
}

export function formatPercent(fraction: number, uiLocale: string = formattingLocale()): string {
  return new Intl.NumberFormat(uiLocale, { style: 'percent', maximumFractionDigits: 0 }).format(fraction)
}
