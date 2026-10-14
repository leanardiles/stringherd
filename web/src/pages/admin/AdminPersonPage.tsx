import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { ApiError, type User } from '../../api/client'
import {
  useAddAssignment,
  useAdminProjects,
  useAdminUsers,
  useMe,
  useRemoveAssignment,
  useResetPassword,
  useUpdateUser,
} from '../../api/queries'
import { CopyField } from '../../components/admin/CopyBlock'
import { ConfirmDialog, Dialog } from '../../components/admin/Dialog'
import { UserStatus } from '../../components/admin/UserStatus'
import { LoadError, Loading, NotFound } from '../../components/StatusMessage'
import ui from '../../components/ui.module.css'
import { errorMessage } from '../../lib/errors'
import { languageLabel } from '../../lib/languages'
import styles from './Admin.module.css'

export function AdminPersonPage() {
  const { t } = useTranslation()
  const { userId } = useParams()
  const users = useAdminUsers()
  const { data: me } = useMe()

  if (users.isPending) return <Loading />
  if (users.isError) {
    const unreachable = users.error instanceof ApiError && users.error.unreachable
    return <LoadError onRetry={() => void users.refetch()} unreachable={unreachable} />
  }
  const user = users.data.find((candidate) => String(candidate.id) === userId)
  if (!user) return <NotFound />
  const isSelf = user.id === me?.id

  return (
    <div className={styles.page}>
      <Link to="/admin/people" className={styles.back}>
        <ArrowLeft size={14} aria-hidden="true" />
        {t('admin.person.back')}
      </Link>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>
            {user.name}
            {isSelf && <span className={ui.muted}> ({t('common.you')})</span>}
          </h1>
          <p className={styles.subtitle}>{user.email}</p>
        </div>
        <UserStatus user={user} />
      </header>

      {/* Keyed by id so the forms start fresh when moving between people. */}
      <DetailsSection key={`details-${user.id}`} user={user} isSelf={isSelf} />
      <LanguagesSection user={user} />
      <AccessSection user={user} isSelf={isSelf} />
      <PasswordSection user={user} isSelf={isSelf} />
    </div>
  )
}

// ---------- Name and role ----------

function DetailsSection({ user, isSelf }: { user: User; isSelf: boolean }) {
  const { t } = useTranslation()
  const update = useUpdateUser(user.id)
  const [name, setName] = useState(user.name)
  const [role, setRole] = useState(user.role)
  const changed = name.trim() !== user.name || role !== user.role

  return (
    <section className={styles.section} aria-labelledby="details-title">
      <header className={styles.sectionHeader}>
        <h2 id="details-title" className={styles.sectionTitle}>
          {t('admin.person.details')}
        </h2>
      </header>
      <form
        className={styles.sectionBody}
        onSubmit={(event) => {
          event.preventDefault()
          update.mutate({ name: name.trim(), ...(role !== user.role && { role }) })
        }}
      >
        {update.error && (
          <div className={ui.alert} role="alert">
            {errorMessage(update.error, t)}
          </div>
        )}
        {update.isSuccess && !changed && (
          <div className={ui.notice} role="status">
            {t('admin.person.saved')}
          </div>
        )}
        <div className={styles.inlineForm}>
          <div className={`${ui.field} ${styles.grow}`}>
            <label className={ui.label} htmlFor="person-name">
              {t('admin.person.name')}
            </label>
            <input
              className={ui.input}
              id="person-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={200}
              required
            />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="person-role">
              {t('admin.person.role')}
            </label>
            <select
              className={ui.input}
              id="person-role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              disabled={isSelf}
              aria-describedby={isSelf ? 'person-self-note' : undefined}
            >
              <option value="reviewer">{t('user.role.reviewer')}</option>
              <option value="admin">{t('user.role.admin')}</option>
            </select>
          </div>
          <button type="submit" className={ui.primary} disabled={!changed || update.isPending}>
            {update.isPending ? t('common.saving') : t('common.save')}
          </button>
        </div>
        {isSelf && (
          <span id="person-self-note" className={ui.hint}>
            {t('admin.person.selfNote')}
          </span>
        )}
      </form>
    </section>
  )
}

// ---------- Languages ----------

function LanguagesSection({ user }: { user: User }) {
  const { t } = useTranslation()
  const projects = useAdminProjects()
  const add = useAddAssignment(user.id)
  const remove = useRemoveAssignment(user.id)
  const [projectId, setProjectId] = useState('')
  const [locale, setLocale] = useState('')

  const projectNames = new Map(projects.data?.map((project) => [project.project_id, project.name]))
  const selected = projects.data?.find((project) => project.project_id === projectId)
  const assigned = new Set(user.assignments.map((a) => `${a.project_id}/${a.locale}`))
  const available = selected?.target_locales.filter((code) => !assigned.has(`${selected.project_id}/${code}`)) ?? []

  let note: string | null = null
  if (projects.data && projects.data.length === 0) note = t('admin.person.languages.noProjects')
  else if (selected && selected.target_locales.length === 0) note = t('admin.person.languages.noTargets')
  else if (selected && available.length === 0) note = t('admin.person.languages.allAssigned')

  const error = add.error ?? remove.error

  return (
    <section className={styles.section} aria-labelledby="languages-title">
      <header className={styles.sectionHeader}>
        <h2 id="languages-title" className={styles.sectionTitle}>
          {t('admin.person.languages.title')}
        </h2>
      </header>
      {user.role === 'admin' && <p className={styles.intro}>{t('admin.person.languages.adminNote')}</p>}
      {user.assignments.length === 0 ? (
        <p className={styles.empty}>{t('admin.person.languages.empty')}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('admin.person.languages.project')}</th>
                <th scope="col">{t('admin.person.languages.language')}</th>
                <th scope="col">
                  <span className="visually-hidden">{t('admin.project.languages.removeShort')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {user.assignments.map((assignment) => {
                const project = projectNames.get(assignment.project_id) ?? assignment.project_id
                const language = languageLabel(assignment.locale)
                return (
                  <tr key={`${assignment.project_id}/${assignment.locale}`}>
                    <td>
                      <Link to={`/admin/projects/${encodeURIComponent(assignment.project_id)}`} className={styles.rowLink}>
                        {project}
                      </Link>
                    </td>
                    <td>{language}</td>
                    <td className={styles.actionCell}>
                      <button
                        type="button"
                        className={ui.quietDanger}
                        onClick={() => remove.mutate(assignment)}
                        disabled={remove.isPending}
                        aria-label={t('admin.person.languages.remove', { project, language })}
                      >
                        {t('admin.project.languages.removeShort')}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <form
        className={styles.sectionBody}
        onSubmit={(event) => {
          event.preventDefault()
          add.mutate({ project_id: projectId, locale }, { onSuccess: () => setLocale('') })
        }}
      >
        {error && (
          <div className={ui.alert} role="alert">
            {errorMessage(error, t)}
          </div>
        )}
        <div className={styles.inlineForm}>
          <div className={`${ui.field} ${styles.grow}`}>
            <label className={ui.label} htmlFor="assign-project">
              {t('admin.person.languages.project')}
            </label>
            <select
              className={ui.input}
              id="assign-project"
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value)
                setLocale('')
              }}
              required
            >
              <option value="">{t('admin.person.languages.choose')}</option>
              {projects.data?.map((project) => (
                <option key={project.project_id} value={project.project_id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <div className={`${ui.field} ${styles.grow}`}>
            <label className={ui.label} htmlFor="assign-locale">
              {t('admin.person.languages.language')}
            </label>
            <select
              className={ui.input}
              id="assign-locale"
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
              disabled={available.length === 0}
              required
            >
              <option value="">{t('admin.person.languages.choose')}</option>
              {available.map((code) => (
                <option key={code} value={code}>
                  {languageLabel(code)}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={ui.secondary} disabled={!projectId || !locale || add.isPending}>
            {t('admin.person.languages.assign')}
          </button>
        </div>
        {note && <span className={ui.hint}>{note}</span>}
      </form>
    </section>
  )
}

// ---------- Active / deactivated ----------

function AccessSection({ user, isSelf }: { user: User; isSelf: boolean }) {
  const { t } = useTranslation()
  const update = useUpdateUser(user.id)
  const [confirming, setConfirming] = useState(false)

  return (
    <section className={styles.section} aria-labelledby="access-title">
      <header className={styles.sectionHeader}>
        <h2 id="access-title" className={styles.sectionTitle}>
          {t('admin.person.status.title')}
        </h2>
      </header>
      <div className={styles.sectionBody}>
        {update.error && !confirming && (
          <div className={ui.alert} role="alert">
            {errorMessage(update.error, t)}
          </div>
        )}
        <div className={styles.split}>
          <span>{user.is_active ? t('admin.person.status.activeBody') : t('admin.person.status.deactivatedBody')}</span>
          {user.is_active ? (
            <button
              type="button"
              className={ui.secondary}
              onClick={() => setConfirming(true)}
              disabled={isSelf}
              aria-describedby={isSelf ? 'person-self-note' : undefined}
            >
              {t('admin.person.status.deactivate')}
            </button>
          ) : (
            <button
              type="button"
              className={ui.secondary}
              onClick={() => update.mutate({ is_active: true })}
              disabled={update.isPending}
            >
              {t('admin.person.status.reactivate')}
            </button>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          setConfirming(open)
          if (!open) update.reset()
        }}
        title={t('admin.person.status.deactivateTitle', { name: user.name })}
        body={t('admin.person.status.deactivateBody')}
        confirmLabel={t('admin.person.status.deactivateConfirm')}
        onConfirm={() => update.mutate({ is_active: false }, { onSuccess: () => setConfirming(false) })}
        pending={update.isPending}
        error={update.error ? errorMessage(update.error, t) : null}
      />
    </section>
  )
}

// ---------- Password ----------

function PasswordSection({ user, isSelf }: { user: User; isSelf: boolean }) {
  const { t } = useTranslation()
  const reset = useResetPassword(user.id)
  const [confirming, setConfirming] = useState(false)
  const [temporary, setTemporary] = useState<string | null>(null)

  return (
    <section className={styles.section} aria-labelledby="password-title">
      <header className={styles.sectionHeader}>
        <h2 id="password-title" className={styles.sectionTitle}>
          {t('admin.person.password.title')}
        </h2>
      </header>
      <div className={styles.sectionBody}>
        {isSelf ? (
          <p className={ui.muted}>{t('admin.person.password.self')}</p>
        ) : (
          <div className={styles.split}>
            <span>
              {t('admin.person.password.intro')}
              {user.must_change_password && (
                <span className={styles.secondaryLine}>{t('admin.person.password.pending')}</span>
              )}
            </span>
            <button type="button" className={ui.secondary} onClick={() => setConfirming(true)}>
              {t('admin.person.password.reset')}
            </button>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          setConfirming(open)
          if (!open) reset.reset()
        }}
        title={t('admin.person.password.resetTitle', { name: user.name })}
        body={t('admin.person.password.resetBody')}
        confirmLabel={t('admin.person.password.resetConfirm')}
        onConfirm={() =>
          reset.mutate(undefined, {
            onSuccess: (result) => {
              setConfirming(false)
              setTemporary(result.temporary_password)
            },
          })
        }
        pending={reset.isPending}
        error={reset.error ? errorMessage(reset.error, t) : null}
      />
      {temporary && (
        <Dialog
          open
          onOpenChange={(open) => !open && setTemporary(null)}
          modalStrict
          title={t('admin.person.password.doneTitle')}
          description={t('admin.person.password.doneBody', { name: user.name })}
          footer={
            <button type="button" className={ui.primary} onClick={() => setTemporary(null)}>
              {t('common.done')}
            </button>
          }
        >
          <CopyField value={temporary} label={t('admin.people.create.passwordLabel')} />
        </Dialog>
      )}
    </section>
  )
}
