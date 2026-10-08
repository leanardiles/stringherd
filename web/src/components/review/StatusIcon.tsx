import { Circle, CircleCheck, Pencil, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { QaLevel } from '../../lib/qa'
import type { DisplayStatus } from '../../lib/review'
import styles from './StatusIcon.module.css'

// Status symbols (UI plan, decision 17). Each has its own shape, so meaning never depends on colour alone.
const ICONS = { approved: CircleCheck, edited: Pencil, mt: Circle } as const

export function StatusIcon({ status }: { status: DisplayStatus }) {
  const { t } = useTranslation()
  const Icon = ICONS[status]
  const label = t(`review.statusIcon.${status}`)
  return (
    <span className={`${styles.icon} ${styles[status]}`} title={label} role="img" aria-label={label}>
      <Icon size={16} strokeWidth={2} aria-hidden="true" />
    </span>
  )
}

export function QaIcon({ level }: { level: QaLevel }) {
  const { t } = useTranslation()
  if (!level) return <span className={styles.icon} aria-hidden="true" />
  const label = t(`review.qaIcon.${level}`)
  return (
    <span className={`${styles.icon} ${styles[level]}`} title={label} role="img" aria-label={label}>
      <TriangleAlert size={16} strokeWidth={2} aria-hidden="true" />
    </span>
  )
}
