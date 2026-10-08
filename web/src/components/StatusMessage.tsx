import { useTranslation } from 'react-i18next'
import ui from './ui.module.css'
import styles from './StatusMessage.module.css'

/** Centred message for loading and failed states. */
export function StatusMessage({ children }: { children: React.ReactNode }) {
  return <div className={styles.center}>{children}</div>
}

export function Loading() {
  const { t } = useTranslation()
  return (
    <StatusMessage>
      <span className={ui.muted} role="status">
        {t('app.loading')}
      </span>
    </StatusMessage>
  )
}

export function LoadError({ onRetry, unreachable }: { onRetry: () => void; unreachable?: boolean }) {
  const { t } = useTranslation()
  return (
    <StatusMessage>
      <p role="alert">{unreachable ? t('login.errors.network') : t('errors.loadFailed')}</p>
      <button type="button" className={ui.secondary} onClick={onRetry}>
        {t('errors.retry')}
      </button>
    </StatusMessage>
  )
}
