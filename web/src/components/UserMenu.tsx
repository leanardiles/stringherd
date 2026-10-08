import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import type { User } from '../api/client'
import { useLogout } from '../api/queries'
import ui from './ui.module.css'
import styles from './UserMenu.module.css'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function UserMenu({ user }: { user: User }) {
  const { t } = useTranslation()
  const logout = useLogout()
  const navigate = useNavigate()
  const role = user.role === 'admin' ? t('user.role.admin') : t('user.role.reviewer')

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.trigger} aria-label={t('user.menu', { name: user.name })}>
        <span className={styles.avatar} aria-hidden="true">
          {initials(user.name)}
        </span>
        <span className={styles.name}>{user.name}</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.content} align="end" sideOffset={6}>
          <div className={styles.identity}>
            <span className={styles.identityName}>{user.name}</span>
            <span className={ui.muted}>{user.email}</span>
            <span className={ui.pillNeutral}>{role}</span>
          </div>
          <DropdownMenu.Separator className={styles.separator} />
          <DropdownMenu.Item
            className={styles.item}
            onSelect={() => logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) })}
          >
            {t('user.signOut')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
