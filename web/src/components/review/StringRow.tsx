import type { ReviewString } from '../../api/client'
import { countCharacters } from '../../lib/placeholders'
import { checkTranslation, qaLevel } from '../../lib/qa'
import { displayStatus } from '../../lib/review'
import { PlaceholderText } from '../PlaceholderText'
import { StatusPill } from './StatusPill'
import { QaIcon } from './StatusIcon'
import styles from './Review.module.css'

interface Props {
  number: number
  item: ReviewString
  sourceLang: string
  targetLang: string
  onOpen: (key: string) => void
}

/** List view: one collapsed string. */
export function StringRow({ number, item, sourceLang, targetLang, onOpen }: Props) {
  return (
    <button type="button" className={styles.row} onClick={() => onOpen(item.key)}>
      <span className={`${styles.number} tabular`}>{number}</span>
      <span className={styles.key}>{item.key}</span>
      <span className={styles.cell}>
        <PlaceholderText text={item.source_text ?? ''} lang={sourceLang} />
      </span>
      <span className={styles.cell}>
        <PlaceholderText text={item.value} lang={targetLang} />
      </span>
      <span className={`${styles.chars} tabular`}>{countCharacters(item.value)}</span>
      <span className={styles.status}>
        <QaIcon level={qaLevel(checkTranslation(item.source_text, item.value))} />
        <StatusPill status={displayStatus(item)} />
      </span>
    </button>
  )
}
