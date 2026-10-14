import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router'
import { ApiError } from '../api/client'
import { useChangePassword, useLogout, useMe } from '../api/queries'
import { LogoLockup } from '../components/Logo'
import ui from '../components/ui.module.css'
import { errorMessage } from '../lib/errors'
import { MIN_PASSWORD_LENGTH } from '../lib/passwords'
import styles from './LoginPage.module.css'

/**
 * Change your own password. Required right after signing in with a temporary password,
 * in which case there is no way around it except signing out.
 */
export function ChangePasswordPage() {
  const { t } = useTranslation()
  const { data: user } = useMe()
  const change = useChangePassword()
  const logout = useLogout()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const forced = Boolean(user?.must_change_password)
  const [problem, setProblem] = useState<string | null>(null)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const current = String(form.get('current'))
    const next = String(form.get('new'))
    if (next.length < MIN_PASSWORD_LENGTH) return setProblem(t('password.errors.tooShort', { count: MIN_PASSWORD_LENGTH }))
    if (next !== String(form.get('confirm'))) return setProblem(t('password.errors.mismatch'))
    if (next === current) return setProblem(t('password.errors.same'))
    setProblem(null)
    change.mutate(
      { current_password: current, new_password: next },
      { onSuccess: () => navigate(from === '/password' ? '/' : from, { replace: true }) },
    )
  }

  let error = problem
  if (!error && change.error) {
    const detail = change.error instanceof ApiError ? change.error.detail : null
    if (detail === 'Current password is incorrect.') error = t('password.errors.current')
    else error = errorMessage(change.error, t)
  }

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <div className={styles.header}>
          <LogoLockup height={40} />
          <h1 className={styles.title}>{forced ? t('password.forcedTitle') : t('password.title')}</h1>
          {forced && <p className={ui.muted}>{t('password.forcedIntro')}</p>}
        </div>
        <form className={styles.form} onSubmit={handleSubmit}>
          {error && (
            <div className={ui.alert} role="alert">
              {error}
            </div>
          )}
          {/* Lets password managers attach the new password to the right account. */}
          <input type="email" name="username" autoComplete="username" value={user?.email ?? ''} readOnly hidden />
          <div className={ui.field}>
            <label className={ui.label} htmlFor="current">
              {forced ? t('password.currentTemporary') : t('password.current')}
            </label>
            <input className={ui.input} id="current" name="current" type="password" autoComplete="current-password" required autoFocus />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="new">
              {t('password.new')}
            </label>
            <input
              className={ui.input}
              id="new"
              name="new"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              aria-describedby="new-hint"
              required
            />
            <span id="new-hint" className={ui.hint}>
              {t('password.hint', { count: MIN_PASSWORD_LENGTH })}
            </span>
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="confirm">
              {t('password.confirm')}
            </label>
            <input className={ui.input} id="confirm" name="confirm" type="password" autoComplete="new-password" required />
          </div>
          <button type="submit" className={`${ui.primary} ${styles.submit}`} disabled={change.isPending}>
            {change.isPending ? t('password.submitting') : t('password.submit')}
          </button>
          {forced ? (
            <button
              type="button"
              className={ui.quiet}
              onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) })}
            >
              {t('password.signOut')}
            </button>
          ) : (
            <Link to={from === '/password' ? '/' : from} className={ui.quiet}>
              {t('password.back')}
            </Link>
          )}
        </form>
      </main>
    </div>
  )
}
