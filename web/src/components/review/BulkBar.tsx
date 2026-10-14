import { CircleCheck, Undo2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SelectionSummary } from '../../lib/review'
import ui from '../ui.module.css'
import styles from './BulkBar.module.css'

interface Props {
  count: number
  summary: SelectionSummary
  pending: boolean
  onApprove: () => void
  onWithdraw: () => void
  onClear: () => void
}

/** List view: what to do with the selected strings. Shown while something is selected. */
export function BulkBar({ count, summary, pending, onApprove, onWithdraw, onClear }: Props) {
  const { t } = useTranslation()
  const approvable = summary.approvable.length
  // What will actually be approved: strings with QA errors are skipped by the server.
  const willApprove = approvable - summary.withErrors
  const withdrawable = summary.withdrawable.length
  return (
    <div className={styles.bar} role="region" aria-label={t('review.bulk.label')}>
      <span className={`${styles.count} tabular`}>{t('review.bulk.selected', { count })}</span>
      {summary.withErrors > 0 && (
        <span className={styles.warning}>{t('review.bulk.withErrors', { count: summary.withErrors })}</span>
      )}
      <span className={styles.spacer} />
      {approvable > 0 && (
        <button type="button" className={ui.primary} onClick={onApprove} disabled={pending || willApprove === 0}>
          <CircleCheck size={14} aria-hidden="true" />
          {t('review.bulk.approve', { count: willApprove })}
        </button>
      )}
      {withdrawable > 0 && (
        <button type="button" className={ui.secondary} onClick={onWithdraw} disabled={pending}>
          <Undo2 size={14} aria-hidden="true" />
          {t('review.bulk.withdraw', { count: withdrawable })}
        </button>
      )}
      <button type="button" className={ui.quiet} onClick={onClear}>
        {t('review.bulk.clear')}
      </button>
    </div>
  )
}
