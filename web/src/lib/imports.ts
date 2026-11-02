import type { ProjectLocaleAdmin } from '../api/client'

/** Whether a language row shows its next steps: an open import, or DeepL still to translate it. */
export function needsSteps(locale: ProjectLocaleAdmin): boolean {
  const state = locale.existing_translations
  if (!state) return false
  return state.importing || (state.mode === 'retranslate' && locale.total === 0)
}
