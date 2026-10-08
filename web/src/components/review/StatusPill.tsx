import { useTranslation } from 'react-i18next'
import type { DisplayStatus } from '../../lib/review'
import ui from '../ui.module.css'

const CLASS: Record<DisplayStatus, string> = { approved: ui.pillSuccess, edited: ui.pillEdited, mt: ui.pillNeutral }

export function StatusPill({ status }: { status: DisplayStatus }) {
  const { t } = useTranslation()
  return (
    <span className={CLASS[status]} title={t(`review.statusHint.${status}`)}>
      {t(`review.status.${status}`)}
    </span>
  )
}
