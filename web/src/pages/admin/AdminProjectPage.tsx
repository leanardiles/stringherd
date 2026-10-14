import { ArrowLeft, KeyRound, Pencil } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { ApiError, type ApiKey, type ApiKeyIssued, type ProjectAdminDetail, type ProjectLocaleAdmin } from '../../api/client'
import {
  useAddLocale,
  useAdminProject,
  useCreateKey,
  useProjectSetup,
  useRemoveLocale,
  useRevokeKey,
  useUpdateProject,
} from '../../api/queries'
import { CodeBlock, CopyField } from '../../components/admin/CopyBlock'
import { ConfirmDialog, Dialog } from '../../components/admin/Dialog'
import { ProgressBar } from '../../components/ProgressBar'
import { LoadError, Loading, NotFound } from '../../components/StatusMessage'
import ui from '../../components/ui.module.css'
import { errorMessage } from '../../lib/errors'
import { formatDate, formatDateTime } from '../../lib/format'
import { formatPercent, languageLabel } from '../../lib/languages'
import { isLocaleCode } from '../../lib/locales'
import styles from './Admin.module.css'

export function AdminProjectPage() {
  const { t } = useTranslation()
  const { projectId = '' } = useParams()
  const project = useAdminProject(projectId)
  const [editing, setEditing] = useState(false)

  if (project.isPending) return <Loading />
  if (project.isError) {
    if (project.error instanceof ApiError && project.error.status === 404) return <NotFound />
    const unreachable = project.error instanceof ApiError && project.error.unreachable
    return <LoadError onRetry={() => void project.refetch()} unreachable={unreachable} />
  }
  const data = project.data

  return (
    <div className={styles.page}>
      <Link to="/admin/projects" className={styles.back}>
        <ArrowLeft size={14} aria-hidden="true" />
        {t('admin.project.back')}
      </Link>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>{data.name}</h1>
          <p className={styles.subtitle}>
            {t('admin.project.summary', {
              id: data.project_id,
              language: data.source_locale ? languageLabel(data.source_locale) : t('admin.project.noSource'),
            })}
          </p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={ui.secondary} onClick={() => setEditing(true)}>
            <Pencil size={14} aria-hidden="true" />
            {t('admin.project.edit')}
          </button>
        </div>
      </header>

      <LanguagesSection project={data} />
      <KeysSection project={data} />
      <SetupSection projectId={data.project_id} />

      <EditProjectDialog project={data} open={editing} onOpenChange={setEditing} />
    </div>
  )
}

// ---------- Languages ----------

function LanguagesSection({ project }: { project: ProjectAdminDetail }) {
  const { t } = useTranslation()
  const add = useAddLocale(project.project_id)
  const [code, setCode] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const locale = code.trim()
    if (!isLocaleCode(locale)) return setProblem(t('admin.projects.create.invalidLocale', { code: locale }))
    setProblem(null)
    add.mutate(locale, { onSuccess: () => setCode('') })
  }

  const error = problem ?? (add.error ? errorMessage(add.error, t) : null)

  return (
    <section className={styles.section} aria-labelledby="languages-title">
      <header className={styles.sectionHeader}>
        <h2 id="languages-title" className={styles.sectionTitle}>
          {t('admin.project.languages.title')}
        </h2>
      </header>
      <p className={styles.intro}>{t('admin.project.languages.intro')}</p>
      {project.locales.length === 0 ? (
        <p className={styles.empty}>{t('admin.project.languages.empty')}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <tbody>
              {project.locales.map((locale) => (
                <LanguageRow key={locale.locale} locale={locale} onRemove={() => setRemoving(locale.locale)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className={styles.sectionBody}>
        <form className={styles.inlineForm} onSubmit={handleAdd}>
          <div className={`${ui.field} ${styles.grow}`}>
            <label className={ui.label} htmlFor="add-locale">
              {t('admin.project.languages.addLabel')}
            </label>
            <input
              className={`${ui.input} mono`}
              id="add-locale"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={t('admin.project.languages.addPlaceholder')}
              maxLength={35}
              spellCheck={false}
              autoCapitalize="off"
              required
            />
          </div>
          <button type="submit" className={ui.secondary} disabled={add.isPending}>
            {t('admin.project.languages.add')}
          </button>
        </form>
        {isLocaleCode(code.trim()) && !error && <span className={ui.hint}>{languageLabel(code.trim())}</span>}
        {error && (
          <div className={ui.alert} role="alert">
            {error}
          </div>
        )}
      </div>
      {removing && (
        <RemoveLanguageDialog projectId={project.project_id} locale={removing} onClose={() => setRemoving(null)} />
      )}
    </section>
  )
}

function LanguageRow({ locale, onRemove }: { locale: ProjectLocaleAdmin; onRemove: () => void }) {
  const { t } = useTranslation()
  const language = languageLabel(locale.locale)
  const percent = formatPercent(locale.total > 0 ? locale.approved / locale.total : 0)
  return (
    <tr>
      <th scope="row" className={styles.rowHeader}>
        {language}
      </th>
      <td>
        {locale.total > 0 ? (
          <div className={styles.progressCell}>
            <ProgressBar value={locale.approved} max={locale.total} label={t('projects.progress', { percent })} />
            <span className={ui.muted}>
              {t('admin.project.languages.approved', { approved: locale.approved, total: locale.total })}
            </span>
          </div>
        ) : (
          <span className={ui.muted}>{t('admin.project.languages.noStrings')}</span>
        )}
      </td>
      <td>
        {locale.reviewers.length === 0 ? (
          <span className={ui.pillWarning}>{t('admin.project.languages.noReviewers')}</span>
        ) : (
          <span className={styles.chips}>
            {locale.reviewers.map((reviewer) => (
              <Link key={reviewer.id} to={`/admin/people/${reviewer.id}`} className={ui.pillNeutral}>
                {reviewer.name}
              </Link>
            ))}
          </span>
        )}
      </td>
      <td className={styles.actionCell}>
        {locale.total > 0 ? (
          <span className={ui.hint}>{t('admin.project.languages.locked')}</span>
        ) : (
          <button
            type="button"
            className={ui.quietDanger}
            onClick={onRemove}
            aria-label={t('admin.project.languages.remove', { language })}
          >
            {t('admin.project.languages.removeShort')}
          </button>
        )}
      </td>
    </tr>
  )
}

function RemoveLanguageDialog({ projectId, locale, onClose }: { projectId: string; locale: string; onClose: () => void }) {
  const { t } = useTranslation()
  const remove = useRemoveLocale(projectId)
  const language = languageLabel(locale)
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('admin.project.languages.removeTitle', { language })}
      body={t('admin.project.languages.removeBody')}
      confirmLabel={t('admin.project.languages.removeConfirm')}
      onConfirm={() => remove.mutate(locale, { onSuccess: onClose })}
      pending={remove.isPending}
      error={remove.error ? errorMessage(remove.error, t) : null}
    />
  )
}

// ---------- API keys ----------

function KeysSection({ project }: { project: ProjectAdminDetail }) {
  const { t } = useTranslation()
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<ApiKey | null>(null)
  // Newest first; revoked keys stay listed as an audit trail.
  const keys = [...project.api_keys].reverse()

  return (
    <section className={styles.section} aria-labelledby="keys-title">
      <header className={styles.sectionHeader}>
        <h2 id="keys-title" className={styles.sectionTitle}>
          {t('admin.project.keys.title')}
        </h2>
        <button type="button" className={ui.secondary} onClick={() => setCreating(true)}>
          <KeyRound size={14} aria-hidden="true" />
          {t('admin.project.keys.new')}
        </button>
      </header>
      <p className={styles.intro}>{t('admin.project.keys.intro')}</p>
      {keys.length === 0 ? (
        <p className={styles.empty}>{t('admin.project.keys.empty')}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('admin.project.keys.columns.label')}</th>
                <th scope="col">{t('admin.project.keys.columns.key')}</th>
                <th scope="col">{t('admin.project.keys.columns.created')}</th>
                <th scope="col">{t('admin.project.keys.columns.lastUsed')}</th>
                <th scope="col">{t('admin.project.keys.columns.status')}</th>
                <th scope="col">
                  <span className="visually-hidden">{t('admin.project.keys.revoke')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} className={key.revoked_at ? styles.revoked : undefined}>
                  <td>{key.label}</td>
                  <td className={styles.mono}>{key.prefix}…</td>
                  <td>
                    {key.created_at &&
                      (key.created_by
                        ? t('admin.project.keys.createdBy', { date: formatDate(key.created_at), name: key.created_by })
                        : formatDate(key.created_at))}
                  </td>
                  <td>{key.last_used_at ? formatDateTime(key.last_used_at) : t('common.never')}</td>
                  <td>
                    {key.revoked_at ? (
                      <span className={ui.pillNeutral}>
                        {t('admin.project.keys.revoked', { date: formatDate(key.revoked_at) })}
                      </span>
                    ) : (
                      <span className={ui.pillSuccess}>{t('admin.project.keys.active')}</span>
                    )}
                  </td>
                  <td className={styles.actionCell}>
                    {!key.revoked_at && (
                      <button
                        type="button"
                        className={ui.quietDanger}
                        onClick={() => setRevoking(key)}
                        aria-label={t('admin.project.keys.revokeLabel', { label: key.label })}
                      >
                        {t('admin.project.keys.revoke')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <NewKeyDialog projectId={project.project_id} onClose={() => setCreating(false)} />}
      {revoking && <RevokeKeyDialog projectId={project.project_id} apiKey={revoking} onClose={() => setRevoking(null)} />}
    </section>
  )
}

/** Asks for a label, then shows the new key once. The dialog can't be dismissed by accident while the key shows. */
function NewKeyDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const create = useCreateKey(projectId)
  const [label, setLabel] = useState('')
  const [issued, setIssued] = useState<ApiKeyIssued | null>(null)

  if (issued) {
    return (
      <Dialog
        open
        onOpenChange={(open) => !open && onClose()}
        modalStrict
        title={t('admin.project.keys.issuedTitle')}
        description={t('admin.project.keys.issuedBody')}
        footer={
          <button type="button" className={ui.primary} onClick={onClose}>
            {t('common.done')}
          </button>
        }
      >
        <CopyField value={issued.key} label={t('admin.project.keys.issuedLabel')} />
      </Dialog>
    )
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('admin.project.keys.newTitle')}
      footer={
        <>
          <button type="button" className={ui.secondary} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" form="new-key" className={ui.primary} disabled={create.isPending}>
            {create.isPending ? t('admin.project.keys.creating') : t('admin.project.keys.create')}
          </button>
        </>
      }
    >
      <form
        id="new-key"
        className={styles.formStack}
        onSubmit={(event) => {
          event.preventDefault()
          create.mutate(label.trim() || t('admin.project.keys.labelDefault'), { onSuccess: setIssued })
        }}
      >
        {create.error && (
          <div className={ui.alert} role="alert">
            {errorMessage(create.error, t)}
          </div>
        )}
        <div className={ui.field}>
          <label className={ui.label} htmlFor="key-label">
            {t('admin.project.keys.label')}
          </label>
          <input
            className={ui.input}
            id="key-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={100}
            aria-describedby="key-label-hint"
            autoFocus
          />
          <span id="key-label-hint" className={ui.hint}>
            {t('admin.project.keys.labelHint')}
          </span>
        </div>
      </form>
    </Dialog>
  )
}

function RevokeKeyDialog({ projectId, apiKey, onClose }: { projectId: string; apiKey: ApiKey; onClose: () => void }) {
  const { t } = useTranslation()
  const revoke = useRevokeKey(projectId)
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('admin.project.keys.revokeTitle', { label: apiKey.label })}
      body={t('admin.project.keys.revokeBody')}
      confirmLabel={t('admin.project.keys.revokeConfirm')}
      onConfirm={() => revoke.mutate(apiKey.id, { onSuccess: onClose })}
      pending={revoke.isPending}
      error={revoke.error ? errorMessage(revoke.error, t) : null}
    />
  )
}

// ---------- Setup ----------

function SetupSection({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const setup = useProjectSetup(projectId)

  return (
    <section className={styles.section} aria-labelledby="setup-title">
      <header className={styles.sectionHeader}>
        <h2 id="setup-title" className={styles.sectionTitle}>
          {t('admin.project.setup.title')}
        </h2>
      </header>
      <div className={styles.sectionBody}>
        {setup.isPending && <span className={ui.muted}>{t('app.loading')}</span>}
        {setup.isError && (
          <div className={ui.alert} role="alert">
            {errorMessage(setup.error, t)}
          </div>
        )}
        {setup.data && (
          <>
            <p className={ui.muted}>{t('admin.project.setup.intro')}</p>
            <CodeBlock
              code={setup.data.deepl_sync_yaml}
              title={t('admin.project.setup.yaml')}
              label={t('admin.project.setup.yamlThing')}
            />
            <CodeBlock
              code={setup.data.commands}
              title={t('admin.project.setup.commands')}
              label={t('admin.project.setup.commandsThing')}
            />
            <p className={ui.hint}>{t('admin.project.setup.keyNote')}</p>
          </>
        )}
      </div>
    </section>
  )
}

// ---------- Edit ----------

function EditProjectDialog({
  project,
  open,
  onOpenChange,
}: {
  project: ProjectAdminDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const update = useUpdateProject(project.project_id)
  const [name, setName] = useState(project.name)
  const [source, setSource] = useState(project.source_locale ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  // The server has the final say (it checks for uploaded source text); this hides the field early.
  const sourceLocked = project.strings > 0

  function close(next: boolean) {
    if (!next) {
      setName(project.name)
      setSource(project.source_locale ?? '')
      setProblem(null)
      update.reset()
    }
    onOpenChange(next)
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!sourceLocked && !isLocaleCode(source)) {
      return setProblem(t('admin.projects.create.invalidLocale', { code: source }))
    }
    setProblem(null)
    update.mutate(
      {
        name: name.trim(),
        ...(!sourceLocked && source !== project.source_locale && { source_locale: source }),
      },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  const error = problem ?? (update.error ? errorMessage(update.error, t) : null)

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={t('admin.project.editTitle')}
      footer={
        <>
          <button type="button" className={ui.secondary} onClick={() => close(false)}>
            {t('common.cancel')}
          </button>
          <button type="submit" form="edit-project" className={ui.primary} disabled={update.isPending}>
            {update.isPending ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="edit-project" className={styles.formStack} onSubmit={handleSubmit}>
        {error && (
          <div className={ui.alert} role="alert">
            {error}
          </div>
        )}
        <div className={ui.field}>
          <label className={ui.label} htmlFor="edit-name">
            {t('admin.projects.create.name')}
          </label>
          <input
            className={ui.input}
            id="edit-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={200}
            required
            autoFocus
          />
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="edit-id">
            {t('admin.projects.create.id')}
          </label>
          <input className={`${ui.input} mono`} id="edit-id" value={project.project_id} disabled aria-describedby="edit-id-hint" />
          <span id="edit-id-hint" className={ui.hint}>
            {t('admin.project.idLocked')}
          </span>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="edit-source">
            {t('admin.projects.create.source')}
          </label>
          <input
            className={`${ui.input} mono`}
            id="edit-source"
            value={source}
            onChange={(event) => setSource(event.target.value.trim())}
            disabled={sourceLocked}
            maxLength={35}
            spellCheck={false}
            aria-describedby="edit-source-hint"
            required
          />
          <span id="edit-source-hint" className={ui.hint}>
            {sourceLocked ? t('admin.project.sourceLocked') : isLocaleCode(source) ? languageLabel(source) : t('admin.projects.create.sourceHint')}
          </span>
        </div>
      </form>
    </Dialog>
  )
}
