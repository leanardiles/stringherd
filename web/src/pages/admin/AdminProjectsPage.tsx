import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { ApiError } from '../../api/client'
import { useAdminProjects, useCreateProject } from '../../api/queries'
import { Dialog } from '../../components/Dialog'
import { LoadError, Loading } from '../../components/StatusMessage'
import ui from '../../components/ui.module.css'
import { errorMessage } from '../../lib/errors'
import { formatNumber } from '../../lib/format'
import { formatPercent, languageLabel } from '../../lib/languages'
import { isLocaleCode, isProjectId, parseLocaleList, slugify } from '../../lib/locales'
import styles from './Admin.module.css'

export function AdminProjectsPage() {
  const { t } = useTranslation()
  const projects = useAdminProjects()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)

  if (projects.isPending) return <Loading />
  if (projects.isError) {
    const unreachable = projects.error instanceof ApiError && projects.error.unreachable
    return <LoadError onRetry={() => void projects.refetch()} unreachable={unreachable} />
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('admin.projects.title')}</h1>
        <button type="button" className={ui.primary} onClick={() => setCreating(true)}>
          <Plus size={16} aria-hidden="true" />
          {t('admin.projects.new')}
        </button>
      </header>

      <section className={styles.section}>
        {projects.data.length === 0 ? (
          <p className={styles.empty}>{t('admin.projects.empty')}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('admin.projects.columns.project')}</th>
                  <th scope="col">{t('admin.projects.columns.languages')}</th>
                  <th scope="col" className={styles.numeric}>
                    {t('admin.projects.columns.strings')}
                  </th>
                  <th scope="col">{t('admin.projects.columns.keys')}</th>
                </tr>
              </thead>
              <tbody>
                {projects.data.map((project) => {
                  const href = `/admin/projects/${encodeURIComponent(project.project_id)}`
                  return (
                    <tr key={project.project_id} className={styles.linkRow} onClick={() => navigate(href)}>
                      <td>
                        <Link to={href} className={styles.rowLink} onClick={(event) => event.stopPropagation()}>
                          {project.name}
                        </Link>
                        <span className={`${styles.secondaryLine} ${styles.mono}`}>{project.project_id}</span>
                      </td>
                      <td>
                        {project.locales.length === 0 ? (
                          <span className={ui.muted}>{t('admin.projects.noLanguages')}</span>
                        ) : (
                          <span className={styles.chips}>
                            {project.locales.map((locale) => (
                              <span
                                key={locale.locale}
                                className={locale.total > 0 && locale.delivered === locale.total ? ui.pillSuccess : ui.pillNeutral}
                                title={languageLabel(locale.locale)}
                              >
                                {locale.locale}
                                {locale.total > 0 && ` · ${formatPercent(locale.delivered / locale.total)}`}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className={styles.numeric}>{formatNumber(project.strings)}</td>
                      <td>
                        {project.active_keys > 0 ? (
                          t('admin.projects.activeKeys', { count: project.active_keys })
                        ) : (
                          <span className={ui.pillWarning}>{t('admin.projects.noKeys')}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <NewProjectDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(projectId) => navigate(`/admin/projects/${encodeURIComponent(projectId)}`)}
      />
    </div>
  )
}

function NewProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (projectId: string) => void
}) {
  const { t } = useTranslation()
  const create = useCreateProject()
  const [name, setName] = useState('')
  const [projectId, setProjectId] = useState('')
  const [idEdited, setIdEdited] = useState(false)
  const [source, setSource] = useState('en')
  const [targets, setTargets] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  function reset(next: boolean) {
    if (!next) {
      setName('')
      setProjectId('')
      setIdEdited(false)
      setSource('en')
      setTargets('')
      setProblem(null)
      create.reset()
    }
    onOpenChange(next)
  }

  const effectiveId = idEdited ? projectId : slugify(name)
  const targetPreview = parseLocaleList(targets)
    .filter(isLocaleCode)
    .map((code) => languageLabel(code))
    .join(', ')

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const targetLocales = parseLocaleList(targets)
    const invalid = [source, ...targetLocales].find((code) => !isLocaleCode(code))
    if (!isProjectId(effectiveId)) return setProblem(t('admin.projects.create.invalidId'))
    if (invalid !== undefined) return setProblem(t('admin.projects.create.invalidLocale', { code: invalid }))
    if (targetLocales.includes(source)) return setProblem(t('admin.projects.create.sourceIsTarget', { code: source }))
    setProblem(null)
    create.mutate(
      { project_id: effectiveId, name: name.trim(), source_locale: source, target_locales: targetLocales },
      {
        onSuccess: (project) => {
          reset(false)
          onCreated(project.project_id)
        },
      },
    )
  }

  const error = problem ?? (create.error ? errorMessage(create.error, t) : null)

  return (
    <Dialog
      open={open}
      onOpenChange={reset}
      title={t('admin.projects.create.title')}
      footer={
        <>
          <button type="button" className={ui.secondary} onClick={() => reset(false)}>
            {t('common.cancel')}
          </button>
          <button type="submit" form="new-project" className={ui.primary} disabled={create.isPending}>
            {create.isPending ? t('admin.projects.create.submitting') : t('admin.projects.create.submit')}
          </button>
        </>
      }
    >
      <form id="new-project" className={styles.formStack} onSubmit={handleSubmit}>
        {error && (
          <div className={ui.alert} role="alert">
            {error}
          </div>
        )}
        <div className={ui.field}>
          <label className={ui.label} htmlFor="project-name">
            {t('admin.projects.create.name')}
          </label>
          <input
            className={ui.input}
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={200}
            required
            autoFocus
          />
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="project-id">
            {t('admin.projects.create.id')}
          </label>
          <input
            className={`${ui.input} mono`}
            id="project-id"
            value={effectiveId}
            onChange={(event) => {
              setIdEdited(true)
              setProjectId(event.target.value)
            }}
            maxLength={100}
            spellCheck={false}
            autoCapitalize="off"
            aria-describedby="project-id-hint"
            required
          />
          <span id="project-id-hint" className={ui.hint}>
            {t('admin.projects.create.idHint')}
          </span>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="project-source">
            {t('admin.projects.create.source')}
          </label>
          <input
            className={`${ui.input} mono`}
            id="project-source"
            value={source}
            onChange={(event) => setSource(event.target.value.trim())}
            maxLength={35}
            spellCheck={false}
            autoCapitalize="off"
            aria-describedby="project-source-hint"
            required
          />
          <span id="project-source-hint" className={ui.hint}>
            {t('admin.projects.create.sourceHint')}
          </span>
          {isLocaleCode(source) && <span className={ui.hint}>{languageLabel(source)}</span>}
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="project-targets">
            {t('admin.projects.create.targets')}
          </label>
          <input
            className={`${ui.input} mono`}
            id="project-targets"
            value={targets}
            onChange={(event) => setTargets(event.target.value)}
            placeholder="fr, es"
            spellCheck={false}
            autoCapitalize="off"
            aria-describedby="project-targets-hint"
          />
          <span id="project-targets-hint" className={ui.hint}>
            {t('admin.projects.create.targetsHint')}
          </span>
          {targetPreview && <span className={ui.hint}>{targetPreview}</span>}
        </div>
      </form>
    </Dialog>
  )
}
