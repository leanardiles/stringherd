import { useTranslation } from 'react-i18next'
import type { User } from '../../api/client'
import ui from '../ui.module.css'

/** Active, deactivated, or still on a temporary password. */
export function UserStatus({ user }: { user: User }) {
  const { t } = useTranslation()
  if (!user.is_active) return <span className={ui.pillDanger}>{t('admin.people.deactivated')}</span>
  if (user.must_change_password) return <span className={ui.pillWarning}>{t('admin.people.temporary')}</span>
  return <span className={ui.pillSuccess}>{t('admin.people.active')}</span>
}
