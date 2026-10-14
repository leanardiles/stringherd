import { useTranslation } from 'react-i18next'
import { Link, NavLink, useMatch } from 'react-router'
import type { User } from '../api/client'
import { languageLabel } from '../lib/languages'
import { LogoLockup } from './Logo'
import { UserMenu } from './UserMenu'
import styles from './TopBar.module.css'

export function TopBar({ user }: { user: User }) {
  const { t } = useTranslation()
  const review = useMatch('/review/:projectId/:locale')

  return (
    <header className={styles.bar}>
      <Link to="/" className={styles.brand}>
        <LogoLockup height={26} />
      </Link>
      {review && (
        <nav className={styles.breadcrumb} aria-label={t('nav.breadcrumb')}>
          <span className={styles.separator} aria-hidden="true">/</span>
          <span>{review.params.projectId}</span>
          <span className={styles.separator} aria-hidden="true">›</span>
          <span aria-current="page">{languageLabel(review.params.locale ?? '')}</span>
        </nav>
      )}
      <div className={styles.spacer} />
      {user.role === 'admin' && (
        <nav className={styles.nav} aria-label={t('nav.main')}>
          <NavLink to="/" end className={styles.navLink}>
            {t('nav.review')}
          </NavLink>
          <NavLink to="/admin/projects" className={styles.navLink}>
            {t('nav.projects')}
          </NavLink>
          <NavLink to="/admin/people" className={styles.navLink}>
            {t('nav.people')}
          </NavLink>
        </nav>
      )}
      <UserMenu user={user} />
    </header>
  )
}
