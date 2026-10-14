import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { displayKeys, GROUPS, isMac, matchShortcut, SHORTCUTS } from '../../lib/shortcuts'
import { Dialog } from '../Dialog'
import ui from '../ui.module.css'
import { OpenShortcuts } from './context'
import styles from './Shortcuts.module.css'

/** Holds the shortcuts reference for the signed-in app; Ctrl+/ or ? opens it anywhere. */
export function ShortcutsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (document.querySelector('[role="dialog"]')) return
      if (matchShortcut(event, 'app')?.id === 'showShortcuts') {
        event.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <OpenShortcuts.Provider value={() => setOpen(true)}>
      {children}
      {open && <ShortcutsDialog onClose={() => setOpen(false)} />}
    </OpenShortcuts.Provider>
  )
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const mac = useMemo(() => isMac(), [])
  const needle = query.trim().toLocaleLowerCase()
  const rows = SHORTCUTS.map((s) => ({
    ...s,
    label: t(`shortcuts.labels.${s.id}`),
    shown: s.keys.map((k) => displayKeys(k, mac)),
  })).filter(
    (s) => !needle || s.label.toLocaleLowerCase().includes(needle) || s.shown.some((k) => k.toLocaleLowerCase().includes(needle)),
  )

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()} title={t('shortcuts.title')} wide>
      <input
        className={ui.input}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('shortcuts.search')}
        aria-label={t('shortcuts.search')}
        autoFocus
      />
      {rows.length === 0 && <p className={ui.muted}>{t('shortcuts.none')}</p>}
      <div className={styles.groups}>
        {GROUPS.map((group) => {
          const inGroup = rows.filter((s) => s.group === group)
          if (inGroup.length === 0) return null
          return (
            <section key={group} aria-labelledby={`shortcuts-${group}`}>
              <h3 id={`shortcuts-${group}`} className={styles.groupTitle}>
                {t(`shortcuts.groups.${group}`)}
              </h3>
              <dl className={styles.list}>
                {inGroup.map((s) => (
                  <div key={s.id} className={styles.row}>
                    <dt className={styles.keys}>
                      {s.shown.map((k, i) => (
                        <span key={k}>
                          {i > 0 && <span className={ui.muted}> {t('shortcuts.or')} </span>}
                          <kbd className={styles.kbd}>{k}</kbd>
                        </span>
                      ))}
                    </dt>
                    <dd>{s.label}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )
        })}
      </div>
      <p className={ui.hint}>{t('shortcuts.note')}</p>
    </Dialog>
  )
}
