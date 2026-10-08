import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { ApiError } from '../api/client'
import { useLogin, useMe } from '../api/queries'
import { Logo } from '../components/Logo'
import ui from '../components/ui.module.css'
import styles from './LoginPage.module.css'

export function LoginPage() {
  const { t } = useTranslation()
  const me = useMe()
  const login = useLogin()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  if (me.data) return <Navigate to={from} replace />

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    login.mutate(
      { email: String(form.get('email')), password: String(form.get('password')) },
      { onSuccess: () => navigate(from, { replace: true }) },
    )
  }

  let error: string | null = null
  if (login.error instanceof ApiError) {
    if (login.error.status === 401) error = t('login.errors.invalid')
    else if (login.error.unreachable) error = t('login.errors.network')
    else error = t('login.errors.unknown')
  }

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <div className={styles.header}>
          <Logo size={36} />
          <h1 className={styles.title}>{t('login.title')}</h1>
          <p className={ui.muted}>{t('login.subtitle')}</p>
        </div>
        <form className={styles.form} onSubmit={handleSubmit} noValidate={false}>
          {error && (
            <div className={ui.alert} role="alert">
              {error}
            </div>
          )}
          <div className={ui.field}>
            <label className={ui.label} htmlFor="email">
              {t('login.email')}
            </label>
            <input className={ui.input} id="email" name="email" type="email" autoComplete="username" required autoFocus />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="password">
              {t('login.password')}
            </label>
            <input
              className={ui.input}
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <button type="submit" className={`${ui.primary} ${styles.submit}`} disabled={login.isPending}>
            {login.isPending ? t('login.submitting') : t('login.submit')}
          </button>
        </form>
      </main>
    </div>
  )
}
