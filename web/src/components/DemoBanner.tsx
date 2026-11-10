import { Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useDemo } from '../api/queries'
import styles from './DemoBanner.module.css'

/** On the hosted demo only: a line above every page saying it is shared and when it resets. */
export function DemoBanner() {
  const { t, i18n } = useTranslation()
  const demo = useDemo()
  if (!demo.data) return null
  const times = new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(demo.data.resets_utc)
  return (
    <div className={styles.banner} role="note">
      <Info size={14} aria-hidden="true" />
      <span>{t('demo.banner', { times })}</span>
    </div>
  )
}
