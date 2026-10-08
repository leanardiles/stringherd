// Pseudo-localization: turns "Approve" into "[Àƥƥŕöṽé ~~~]" so untranslated text
// and layouts that break with longer languages show up before a real translation
// exists. Placeholders such as {{count}} are left untouched.

const ACCENTED: Record<string, string> = {
  a: 'à', b: 'ƀ', c: 'ç', d: 'ď', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'î', j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ',
  n: 'ñ', o: 'ö', p: 'ƥ', q: 'ʠ', r: 'ŕ', s: 'š', t: 'ţ', u: 'û', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'À', B: 'Ɓ', C: 'Ç', D: 'Ď', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Î', J: 'Ĵ', K: 'Ķ', L: 'Ļ', M: 'Ṁ',
  N: 'Ñ', O: 'Ö', P: 'Ƥ', Q: 'Ǫ', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Û', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
}

const PLACEHOLDER = /(\{\{[^}]+\}\}|\$t\([^)]*\))/

export function pseudoize(text: string): string {
  const parts = text.split(PLACEHOLDER)
  const accented = parts
    .map((part, i) => (i % 2 === 1 ? part : [...part].map((ch) => ACCENTED[ch] ?? ch).join('')))
    .join('')
  // Longer languages (German, French) often run 30 to 40% longer than English.
  const visible = parts.filter((_, i) => i % 2 === 0).join('').length
  const padding = '~'.repeat(Math.max(1, Math.ceil(visible * 0.35)))
  return `[${accented} ${padding}]`
}

type Catalog = { [key: string]: string | Catalog }

export function pseudoizeCatalog(catalog: Catalog): Catalog {
  return Object.fromEntries(
    Object.entries(catalog).map(([key, value]) => [
      key,
      typeof value === 'string' ? pseudoize(value) : pseudoizeCatalog(value),
    ]),
  )
}
