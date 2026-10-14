import { UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { ApiError, type User, type UserCreated } from '../../api/client'
import { useAdminUsers, useCreateUser, useMe } from '../../api/queries'
import { CopyField } from '../../components/admin/CopyBlock'
import { Dialog } from '../../components/admin/Dialog'
import { UserStatus } from '../../components/admin/UserStatus'
import { LoadError, Loading } from '../../components/StatusMessage'
import ui from '../../components/ui.module.css'
import { errorMessage } from '../../lib/errors'
import { formatDate } from '../../lib/format'
import { MIN_PASSWORD_LENGTH } from '../../lib/passwords'
import styles from './Admin.module.css'

export function AdminPeoplePage() {
  const { t } = useTranslation()
  const users = useAdminUsers()
  const { data: me } = useMe()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)

  if (users.isPending) return <Loading />
  if (users.isError) {
    const unreachable = users.error instanceof ApiError && users.error.unreachable
    return <LoadError onRetry={() => void users.refetch()} unreachable={unreachable} />
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('admin.people.title')}</h1>
        <button type="button" className={ui.primary} onClick={() => setAdding(true)}>
          <UserPlus size={16} aria-hidden="true" />
          {t('admin.people.add')}
        </button>
      </header>

      <section className={styles.section}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('admin.people.columns.person')}</th>
                <th scope="col">{t('admin.people.columns.role')}</th>
                <th scope="col">{t('admin.people.columns.languages')}</th>
                <th scope="col">{t('admin.people.columns.status')}</th>
                <th scope="col">{t('admin.people.columns.lastSignIn')}</th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((user) => {
                const href = `/admin/people/${user.id}`
                return (
                  <tr key={user.id} className={styles.linkRow} onClick={() => navigate(href)}>
                    <td>
                      <Link to={href} className={styles.rowLink} onClick={(event) => event.stopPropagation()}>
                        {user.name}
                      </Link>
                      {user.id === me?.id && <span className={ui.muted}> ({t('common.you')})</span>}
                      <span className={styles.secondaryLine}>{user.email}</span>
                    </td>
                    <td>{user.role === 'admin' ? t('user.role.admin') : t('user.role.reviewer')}</td>
                    <td>
                      <Assignments user={user} />
                    </td>
                    <td>
                      <UserStatus user={user} />
                    </td>
                    <td>{user.last_login_at ? formatDate(user.last_login_at) : t('common.never')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {adding && (
        <AddPersonDialog
          onClose={() => setAdding(false)}
          onAssign={(user) => navigate(`/admin/people/${user.id}`)}
        />
      )}
    </div>
  )
}

function Assignments({ user }: { user: User }) {
  const { t } = useTranslation()
  if (user.role === 'admin') return <span className={ui.muted}>{t('admin.people.allLanguages')}</span>
  if (user.assignments.length === 0) return <span className={ui.pillWarning}>{t('admin.people.noLanguages')}</span>
  return (
    <span className={styles.chips}>
      {user.assignments.map((assignment) => (
        <span key={`${assignment.project_id}/${assignment.locale}`} className={ui.pillNeutral}>
          {assignment.project_id} · {assignment.locale}
        </span>
      ))}
    </span>
  )
}

/** Creates the account, then shows the temporary password once. */
function AddPersonDialog({ onClose, onAssign }: { onClose: () => void; onAssign: (user: UserCreated) => void }) {
  const { t } = useTranslation()
  const create = useCreateUser()
  const [role, setRole] = useState<'reviewer' | 'admin'>('reviewer')
  const [mode, setMode] = useState<'generate' | 'choose'>('generate')
  const [created, setCreated] = useState<UserCreated | null>(null)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    create.mutate(
      {
        name: String(form.get('name')).trim(),
        email: String(form.get('email')).trim(),
        role,
        ...(mode === 'choose' && { password: String(form.get('password')) }),
      },
      { onSuccess: setCreated },
    )
  }

  if (created) {
    return (
      <Dialog
        open
        onOpenChange={(open) => !open && onClose()}
        modalStrict={created.temporary_password !== null}
        title={t('admin.people.create.createdTitle', { name: created.name })}
        description={
          created.temporary_password ? t('admin.people.create.createdGenerated') : t('admin.people.create.createdChosen')
        }
        footer={
          <>
            {created.role === 'reviewer' && (
              <button type="button" className={ui.secondary} onClick={() => onAssign(created)}>
                {t('admin.people.create.assign')}
              </button>
            )}
            <button type="button" className={ui.primary} onClick={onClose}>
              {t('common.done')}
            </button>
          </>
        }
      >
        {created.temporary_password && (
          <CopyField value={created.temporary_password} label={t('admin.people.create.passwordLabel')} />
        )}
      </Dialog>
    )
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('admin.people.create.title')}
      footer={
        <>
          <button type="button" className={ui.secondary} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" form="add-person" className={ui.primary} disabled={create.isPending}>
            {create.isPending ? t('admin.people.create.submitting') : t('admin.people.create.submit')}
          </button>
        </>
      }
    >
      <form id="add-person" className={styles.formStack} onSubmit={handleSubmit}>
        {create.error && (
          <div className={ui.alert} role="alert">
            {errorMessage(create.error, t)}
          </div>
        )}
        <div className={ui.field}>
          <label className={ui.label} htmlFor="person-name">
            {t('admin.people.create.name')}
          </label>
          <input className={ui.input} id="person-name" name="name" maxLength={200} autoComplete="off" required autoFocus />
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="person-email">
            {t('admin.people.create.email')}
          </label>
          <input className={ui.input} id="person-email" name="email" type="email" autoComplete="off" required />
        </div>
        <fieldset className={styles.radioGroup}>
          <legend className={ui.label}>{t('admin.people.create.role')}</legend>
          {(['reviewer', 'admin'] as const).map((value) => (
            <label key={value} className={styles.radio}>
              <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} />
              <span>
                {t(`admin.people.create.${value}`)}
                <span className={styles.secondaryLine}>{t(`admin.people.create.${value}Hint`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset className={styles.radioGroup}>
          <legend className={ui.label}>{t('admin.people.create.password')}</legend>
          {(['generate', 'choose'] as const).map((value) => (
            <label key={value} className={styles.radio}>
              <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} />
              <span>{t(`admin.people.create.${value}`)}</span>
            </label>
          ))}
        </fieldset>
        {mode === 'choose' && (
          <div className={ui.field}>
            <label className={ui.label} htmlFor="person-password">
              {t('admin.people.create.passwordLabel')}
            </label>
            <input
              className={ui.input}
              id="person-password"
              name="password"
              type="text"
              autoComplete="off"
              spellCheck={false}
              minLength={MIN_PASSWORD_LENGTH}
              aria-describedby="person-password-hint"
              required
            />
            <span id="person-password-hint" className={ui.hint}>
              {t('admin.people.create.passwordHint', { count: MIN_PASSWORD_LENGTH })}
            </span>
          </div>
        )}
      </form>
    </Dialog>
  )
}
