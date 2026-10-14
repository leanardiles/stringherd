import { useTranslation } from 'react-i18next'
import type { ReviewString } from '../../api/client'
import { countCharacters } from '../../lib/placeholders'
import { checkTranslation, qaLevel } from '../../lib/qa'
import { displayStatus, isSelectable } from '../../lib/review'
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
  selected: boolean
  /** `range` is true for Shift+click: select everything since the last checkbox clicked. */
  onSelect: (key: string, range: boolean) => void
}

/** List view: one collapsed string, with its checkbox for bulk actions. */
export function StringRow({ number, item, sourceLang, targetLang, onOpen, selected, onSelect }: Props) {
  const { t } = useTranslation()
  const selectable = isSelectable(item)
  return (
    <div className={`${styles.selectable} ${selected ? styles.selected : ''}`}>
      <span className={styles.check}>
        <input
          type="checkbox"
          checked={selected}
          disabled={!selectable}
          aria-label={t('review.bulk.selectOne', { key: item.key })}
          title={selectable ? undefined : t('review.bulk.locked')}
          // Click, not change: only the click event says whether Shift was held. Space on a
          // focused checkbox also fires click.
          onClick={(event) => onSelect(item.key, event.shiftKey)}
          onChange={() => {}}
        />
      </span>
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
    </div>
  )
}
