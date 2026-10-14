/** Same rule as the server (LOCALE_PATTERN): "fr", "es-AR", "zh-Hant", "pt-BR". */
const LOCALE_PATTERN = /^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/

export function isLocaleCode(code: string): boolean {
  return code.length <= 35 && LOCALE_PATTERN.test(code)
}

/** "fr, es ,de-CH," → ["fr", "es", "de-CH"], without duplicates. */
export function parseLocaleList(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((code) => code.trim()).filter(Boolean))]
}

/** Same rule as the server for project ids. */
export function isProjectId(id: string): boolean {
  return /^[A-Za-z0-9._-]{1,100}$/.test(id)
}

/** A project id suggestion from its name: "My App" → "my-app". */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}
