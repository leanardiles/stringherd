import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../locales/en/common.json'
import { pseudoizeCatalog } from './pseudo'

// Stringherd's own interface text. English is the source; other languages will be
// machine-translated with DeepL Sync and reviewed in Stringherd itself.
// In development, add ?lang=pseudo to the URL to see the pseudo-locale.
export const PSEUDO = 'en-XA'

function initialLanguage(): string {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('lang') === 'pseudo') {
    return PSEUDO
  }
  return 'en'
}

const resources: Record<string, { common: typeof en }> = { en: { common: en } }
if (import.meta.env.DEV) {
  resources[PSEUDO] = { common: pseudoizeCatalog(en) as typeof en }
}

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage(),
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
})

/** The language to use for Intl formatting (the pseudo-locale formats like English). */
export function formattingLocale(): string {
  return i18n.language === PSEUDO ? 'en' : i18n.language
}

export default i18n
