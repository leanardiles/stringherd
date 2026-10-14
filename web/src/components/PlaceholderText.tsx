import { useContext } from 'react'
import { INVISIBLES, invisibleKind, splitPlaceholders } from '../lib/placeholders'
import { ShowInvisiblesContext } from './invisibles'
import styles from './PlaceholderText.module.css'

/** Plain text, with each space-like character wrapped so the CSS can draw its mark. */
function TextWithInvisibles({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(INVISIBLES)) {
    const at = match.index ?? 0
    if (at > last) parts.push(text.slice(last, at))
    parts.push(
      <span key={at} className={styles[invisibleKind(match[0])]}>
        {match[0]}
      </span>,
    )
    last = at + 1
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

/** Read-only text with placeholders and tags shown as chips, matching the editor. */
export function PlaceholderText({ text, lang }: { text: string; lang?: string }) {
  const showInvisibles = useContext(ShowInvisiblesContext)
  return (
    <span lang={lang} className={showInvisibles ? styles.preserve : undefined}>
      {splitPlaceholders(text).map((segment, i) =>
        segment.kind === 'text' ? (
          <span key={i}>{showInvisibles ? <TextWithInvisibles text={segment.value} /> : segment.value}</span>
        ) : (
          <span key={i} className={styles.chip}>
            {segment.value}
          </span>
        ),
      )}
    </span>
  )
}
