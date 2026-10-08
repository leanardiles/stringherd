import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { ReviewString } from '../../api/client'
import { checkTranslation, qaLevel } from '../../lib/qa'
import { displayStatus } from '../../lib/review'
import { QaIcon, StatusIcon } from './StatusIcon'
import styles from './KeyList.module.css'

interface Props {
  items: ReviewString[]
  activeKey: string | null
  /** The open string's current text, including unsaved typing, so its symbols update live. */
  activeValue: string
  onOpen: (key: string) => void
}

/** Single key view, left pane: key name, a muted line of source text, and the QA and status symbols. */
export function KeyList({ items, activeKey, activeValue, onOpen }: Props) {
  const { t } = useTranslation()
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [activeKey])

  return (
    <nav className={styles.pane} aria-label={t('review.keyList')}>
      <ul className={styles.list}>
        {items.map((saved) => {
          const active = saved.key === activeKey
          const dirty = active && activeValue !== saved.value
          const item = dirty ? { ...saved, value: activeValue, status: 'machine_translated' } : saved
          return (
            <li key={item.key}>
              <button
                ref={active ? activeRef : undefined}
                type="button"
                className={styles.row}
                aria-current={active ? 'true' : undefined}
                onClick={() => onOpen(item.key)}
              >
                <span className={styles.text}>
                  <span className={`mono ${styles.key}`}>{item.key}</span>
                  <span className={styles.source}>{item.source_text ?? ''}</span>
                </span>
                <QaIcon level={qaLevel(checkTranslation(item.source_text, item.value))} />
                <StatusIcon status={displayStatus(item)} />
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
