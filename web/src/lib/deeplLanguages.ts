import { languageParts } from './languages'

/**
 * The languages DeepL translates into, as the codes a repository uses for them.
 *
 * A target locale in .deepl-sync.yaml is also the language DeepL translates into, so a language
 * Stringherd reviews must be one of these (Latin American Spanish is es-419, not es-AR).
 *
 * Source: DeepL's documentation (github.com/DeepLcom/api-docs, snippets/language-table.jsx),
 * read on 2026-11-01. DeepL's codes are written in BCP 47 case (ES-419 is es-419, ZH-HANS is
 * zh-Hans). English and Portuguese appear only as their variants: as a target, DeepL needs en-GB
 * or en-US, pt-BR or pt-PT. The English name is DeepL's, kept for search; the page shows the name
 * in the interface language. When DeepL adds a language, the Add language dialog still accepts
 * any valid code ("Another code"), and this list can be updated.
 */
export const DEEPL_TARGET_LANGUAGES: readonly (readonly [code: string, deeplName: string])[] = [
  ['ace', 'Acehnese'],
  ['af', 'Afrikaans'],
  ['sq', 'Albanian'],
  ['ar', 'Arabic'],
  ['an', 'Aragonese'],
  ['hy', 'Armenian'],
  ['as', 'Assamese'],
  ['ay', 'Aymara'],
  ['az', 'Azerbaijani'],
  ['ba', 'Bashkir'],
  ['eu', 'Basque'],
  ['be', 'Belarusian'],
  ['bn', 'Bengali'],
  ['bho', 'Bhojpuri'],
  ['bs', 'Bosnian'],
  ['br', 'Breton'],
  ['bg', 'Bulgarian'],
  ['my', 'Burmese'],
  ['yue', 'Cantonese'],
  ['ca', 'Catalan'],
  ['ceb', 'Cebuano'],
  ['zh-Hans', 'Chinese (simplified)'],
  ['zh-Hant', 'Chinese (traditional)'],
  ['zh', 'Chinese (unspecified variant)'],
  ['hr', 'Croatian'],
  ['cs', 'Czech'],
  ['da', 'Danish'],
  ['prs', 'Dari'],
  ['nl', 'Dutch'],
  ['en-US', 'English (American)'],
  ['en-GB', 'English (British)'],
  ['eo', 'Esperanto'],
  ['et', 'Estonian'],
  ['fi', 'Finnish'],
  ['fr', 'French'],
  ['fr-CA', 'French (Canadian)'],
  ['fr-FR', 'French (France)'],
  ['gl', 'Galician'],
  ['ka', 'Georgian'],
  ['de', 'German'],
  ['de-DE', 'German (Germany)'],
  ['de-CH', 'German (Swiss)'],
  ['el', 'Greek'],
  ['gn', 'Guarani'],
  ['gu', 'Gujarati'],
  ['ht', 'Haitian Creole'],
  ['ha', 'Hausa'],
  ['he', 'Hebrew'],
  ['hi', 'Hindi'],
  ['hu', 'Hungarian'],
  ['is', 'Icelandic'],
  ['ig', 'Igbo'],
  ['id', 'Indonesian'],
  ['ga', 'Irish'],
  ['it', 'Italian'],
  ['ja', 'Japanese'],
  ['jv', 'Javanese'],
  ['pam', 'Kapampangan'],
  ['kk', 'Kazakh'],
  ['gom', 'Konkani'],
  ['ko', 'Korean'],
  ['kmr', 'Kurdish (Kurmanji)'],
  ['ckb', 'Kurdish (Sorani)'],
  ['ky', 'Kyrgyz'],
  ['la', 'Latin'],
  ['lv', 'Latvian'],
  ['ln', 'Lingala'],
  ['lt', 'Lithuanian'],
  ['lmo', 'Lombard'],
  ['lb', 'Luxembourgish'],
  ['mk', 'Macedonian'],
  ['mai', 'Maithili'],
  ['mg', 'Malagasy'],
  ['ms', 'Malay'],
  ['ml', 'Malayalam'],
  ['mt', 'Maltese'],
  ['mi', 'Maori'],
  ['mr', 'Marathi'],
  ['mn', 'Mongolian'],
  ['ne', 'Nepali'],
  ['nb', 'Norwegian (bokmål)'],
  ['oc', 'Occitan'],
  ['om', 'Oromo'],
  ['pag', 'Pangasinan'],
  ['ps', 'Pashto'],
  ['fa', 'Persian'],
  ['pl', 'Polish'],
  ['pt-BR', 'Portuguese (Brazilian)'],
  ['pt-PT', 'Portuguese (European)'],
  ['pa', 'Punjabi'],
  ['qu', 'Quechua'],
  ['ro', 'Romanian'],
  ['ru', 'Russian'],
  ['sa', 'Sanskrit'],
  ['sr', 'Serbian'],
  ['st', 'Sesotho'],
  ['scn', 'Sicilian'],
  ['sk', 'Slovak'],
  ['sl', 'Slovenian'],
  ['es', 'Spanish'],
  ['es-ES', 'Spanish'],
  ['es-419', 'Spanish (Latin American)'],
  ['su', 'Sundanese'],
  ['sw', 'Swahili'],
  ['sv', 'Swedish'],
  ['tl', 'Tagalog'],
  ['tg', 'Tajik'],
  ['ta', 'Tamil'],
  ['tt', 'Tatar'],
  ['te', 'Telugu'],
  ['th', 'Thai'],
  ['ts', 'Tsonga'],
  ['tn', 'Tswana'],
  ['tr', 'Turkish'],
  ['tk', 'Turkmen'],
  ['uk', 'Ukrainian'],
  ['ur', 'Urdu'],
  ['uz', 'Uzbek'],
  ['vi', 'Vietnamese'],
  ['cy', 'Welsh'],
  ['wo', 'Wolof'],
  ['xh', 'Xhosa'],
  ['yi', 'Yiddish'],
  ['zu', 'Zulu'],
]

const CODES = new Set(DEEPL_TARGET_LANGUAGES.map(([code]) => code.toLowerCase()))

export function isDeeplTarget(code: string): boolean {
  return CODES.has(code.trim().toLowerCase())
}

export interface LanguageOption {
  code: string
  /** The name in the interface language, e.g. Spanish. */
  name: string
  /** The region, when the code has one, e.g. Latin America. */
  region?: string
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

/**
 * DeepL's languages matching what the admin typed, best matches first: the code itself, then
 * codes and names that start with it, then names that contain it. Matches the interface
 * language's name, DeepL's English name and the code.
 */
export function searchDeeplLanguages(query: string, uiLocale?: string): LanguageOption[] {
  const q = fold(query.trim())
  const ranked: { option: LanguageOption; rank: number }[] = []
  for (const [code, deeplName] of DEEPL_TARGET_LANGUAGES) {
    const { name, region } = languageParts(code, uiLocale)
    const option = { code, name: name === code ? deeplName : name, region }
    if (!q) {
      ranked.push({ option, rank: 3 })
      continue
    }
    const words = [fold(option.name), fold(deeplName), fold(region ?? '')]
    const lowerCode = code.toLowerCase()
    let rank: number | null = null
    if (lowerCode === q) rank = 0
    else if (lowerCode.startsWith(q) || words.some((word) => word.startsWith(q))) rank = 1
    else if (words.some((word) => word.includes(q))) rank = 2
    if (rank !== null) ranked.push({ option, rank })
  }
  return ranked
    .sort((a, b) => a.rank - b.rank || a.option.name.localeCompare(b.option.name) || a.option.code.localeCompare(b.option.code))
    .map(({ option }) => option)
}
