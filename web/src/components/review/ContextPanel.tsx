import { ImageOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ReviewString } from '../../api/client'
import { formattingLocale } from '../../i18n'
import styles from './ContextPanel.module.css'

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  return new Intl.DateTimeFormat(formattingLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

/** Single key view, right pane: read-only context that helps decide (UI plan, decision 2). */
export function ContextPanel({ item }: { item: ReviewString | null }) {
  const { t } = useTranslation()
  return (
    <aside className={styles.pane} aria-label={t('review.context.details')}>
      <section className={styles.section}>
        <h2 className={styles.heading}>{t('review.context.screenshot')}</h2>
        <div className={styles.empty}>
          <ImageOff size={20} aria-hidden="true" />
          <span>{t('review.context.noScreenshot')}</span>
        </div>
      </section>
      {item && (
        <section className={styles.section}>
          <h2 className={styles.heading}>{t('review.context.details')}</h2>
          <dl className={styles.details}>
            <dt>{t('review.context.key')}</dt>
            <dd className="mono">{item.key}</dd>
            {item.source_file && (
              <>
                <dt>{t('review.context.file')}</dt>
                <dd className={`mono ${styles.wrap}`}>{item.source_file}</dd>
              </>
            )}
            {item.updated_at && (
              <>
                <dt>{t('review.context.updated')}</dt>
                <dd>{formatDate(item.updated_at)}</dd>
              </>
            )}
            {item.status === 'approved' && item.approved_by && (
              <>
                <dt>{t('review.context.approved')}</dt>
                <dd>{t('review.context.approvedByOn', { name: item.approved_by, date: formatDate(item.approved_at) ?? '' })}</dd>
              </>
            )}
          </dl>
        </section>
      )}
    </aside>
  )
}
