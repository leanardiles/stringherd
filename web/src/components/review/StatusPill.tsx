import { useTranslation } from 'react-i18next'
import type { DisplayStatus } from '../../lib/review'
import ui from '../ui.module.css'

const CLASS: Record<DisplayStatus, string> = {
  delivered: ui.pillDelivered,
  approved: ui.pillSuccess,
  edited: ui.pillEdited,
  mt: ui.pillNeutral,
}

export function StatusPill({ status, origin }: { status: DisplayStatus; origin?: string }) {
  const { t } = useTranslation()
  const hint = status === 'mt' && origin === 'repository' ? 'mtRepository' : status
  return (
    <span className={CLASS[status]} title={t(`review.statusHint.${hint}`)}>
      {t(`review.status.${status}`)}
    </span>
  )
}
