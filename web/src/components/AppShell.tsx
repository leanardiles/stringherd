import { Outlet } from 'react-router'
import { useMe } from '../api/queries'
import { ShortcutsProvider } from './shortcuts/ShortcutsProvider'
import { TopBar } from './TopBar'
import styles from './AppShell.module.css'

/** Signed-in layout: top bar plus the current page. Rendered inside RequireAuth. */
export function AppShell() {
  const { data: user } = useMe()
  if (!user) return null
  return (
    <ShortcutsProvider>
      <div className={styles.shell}>
        <TopBar user={user} />
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </ShortcutsProvider>
  )
}
