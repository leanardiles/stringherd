import { splitPlaceholders } from '../lib/placeholders'
import styles from './PlaceholderText.module.css'

/** Read-only text with placeholders and tags shown as chips, matching the editor. */
export function PlaceholderText({ text, lang }: { text: string; lang?: string }) {
  return (
    <span lang={lang}>
      {splitPlaceholders(text).map((segment, i) =>
        segment.kind === 'text' ? (
          <span key={i}>{segment.value}</span>
        ) : (
          <span key={i} className={styles.chip}>
            {segment.value}
          </span>
        ),
      )}
    </span>
  )
}
