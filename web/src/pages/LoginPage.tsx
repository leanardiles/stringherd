import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { ApiError } from '../api/client'
import { useDemo, useDemoSignIn, useLogin, useMe } from '../api/queries'
import { DemoBanner } from '../components/DemoBanner'
import { LogoLockup } from '../components/Logo'
import ui from '../components/ui.module.css'
import styles from './LoginPage.module.css'

export function LoginPage() {
  const { t } = useTranslation()
  const me = useMe()
  const demo = useDemo()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  if (me.data) return <Navigate to={from} replace />

  return (
    <div className={styles.screen}>
      <DemoBanner />
      <div className={styles.page}>
        <main className={styles.card}>
          <div className={styles.header}>
            <LogoLockup height={40} />
            <h1 className={styles.title}>{demo.data ? t('login.demo.title') : t('login.title')}</h1>
            <p className={ui.muted}>{demo.data ? t('login.demo.subtitle') : t('login.subtitle')}</p>
          </div>
          {/* Until the server says whether it is the demo, show neither, so the form never flashes. */}
          {demo.isPending ? null : demo.data ? <DemoSignIn from={from} /> : <PasswordSignIn from={from} />}
        </main>
      </div>
    </div>
  )
}

/** The hosted demo: one click signs in to a shared account. */
function DemoSignIn({ from }: { from: string }) {
  const { t } = useTranslation()
  const signIn = useDemoSignIn()
  const navigate = useNavigate()

  function choose(role: 'reviewer' | 'admin') {
    signIn.mutate(role, { onSuccess: () => navigate(from, { replace: true }) })
  }

  let error: string | null = null
  if (signIn.error instanceof ApiError) {
    if (signIn.error.status === 503) error = t('login.demo.notReady')
    else if (signIn.error.unreachable) error = t('login.errors.network')
    else error = t('login.errors.unknown')
  }

  return (
    <div className={styles.form}>
      {error && (
        <div className={ui.alert} role="alert">
          {error}
        </div>
      )}
      <div className={styles.choice}>
        <button
          type="button"
          className={`${ui.primary} ${styles.submit}`}
          disabled={signIn.isPending}
          onClick={() => choose('reviewer')}
        >
          {t('login.demo.reviewer')}
        </button>
        <p className={ui.hint}>{t('login.demo.reviewerHint')}</p>
      </div>
      <div className={styles.choice}>
        <button
          type="button"
          className={`${ui.secondary} ${styles.submit}`}
          disabled={signIn.isPending}
          onClick={() => choose('admin')}
        >
          {t('login.demo.admin')}
        </button>
        <p className={ui.hint}>{t('login.demo.adminHint')}</p>
      </div>
    </div>
  )
}

function PasswordSignIn({ from }: { from: string }) {
  const { t } = useTranslation()
  const login = useLogin()
  const navigate = useNavigate()

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
  )
}
