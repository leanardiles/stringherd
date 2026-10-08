import { diffWords } from '../../lib/diff'
import { PlaceholderText } from '../PlaceholderText'
import styles from './Diff.module.css'

/** DeepL's text with the reviewer's removals struck through and additions highlighted. */
export function Diff({ before, after, lang }: { before: string; after: string; lang?: string }) {
  return (
    <span lang={lang} className={styles.diff}>
      {diffWords(before, after).map((part, i) =>
        part.op === 'equal' ? (
          <PlaceholderText key={i} text={part.text} />
        ) : part.op === 'delete' ? (
          <del key={i} className={styles.removed}>
            <PlaceholderText text={part.text} />
          </del>
        ) : (
          <ins key={i} className={styles.added}>
            <PlaceholderText text={part.text} />
          </ins>
        ),
      )}
    </span>
  )
}
