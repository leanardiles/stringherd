import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ApiError, type ReviewLocale } from '../api/client'
import { useMe, useReviewProjects } from '../api/queries'
import { ProgressBar } from '../components/ProgressBar'
import { LoadError, Loading } from '../components/StatusMessage'
import ui from '../components/ui.module.css'
import { formatPercent, languageLabel } from '../lib/languages'
import styles from './ProjectsPage.module.css'

function LocaleRow({ projectId, locale }: { projectId: string; locale: ReviewLocale }) {
  const { t } = useTranslation()
  const language = languageLabel(locale.locale)
  const toReview = locale.total - locale.approved
  const percent = formatPercent(locale.total > 0 ? locale.approved / locale.total : 0)

  return (
    <li className={styles.locale}>
      <span className={styles.language}>{language}</span>
      <div className={styles.progress}>
        <ProgressBar value={locale.approved} max={locale.total} label={t('projects.progress', { percent })} />
        <span className={`${ui.muted} tabular`}>
          {t('projects.approved', { approved: locale.approved, total: locale.total })}
        </span>
      </div>
      <span className={styles.remaining}>
        {toReview > 0 ? (
          <span className="tabular">{t('projects.toReview', { count: toReview })}</span>
        ) : (
          <span className={ui.pillSuccess}>{t('projects.allApproved')}</span>
        )}
      </span>
      <Link
        to={`/review/${encodeURIComponent(projectId)}/${encodeURIComponent(locale.locale)}`}
        className={ui.secondary}
        aria-label={t('projects.reviewLanguage', { language })}
      >
        {t('projects.review')}
      </Link>
    </li>
  )
}

export function ProjectsPage() {
  const { t } = useTranslation()
  const { data: user } = useMe()
  const projects = useReviewProjects()

  if (projects.isPending) return <Loading />
  if (projects.isError) {
    const unreachable = projects.error instanceof ApiError && projects.error.unreachable
    return <LoadError onRetry={() => void projects.refetch()} unreachable={unreachable} />
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('projects.title')}</h1>
      {projects.data.length === 0 ? (
        <p className={`${styles.empty} ${ui.muted}`}>
          {user?.role === 'admin' ? t('projects.emptyAdmin') : t('projects.emptyReviewer')}
        </p>
      ) : (
        projects.data.map((project) => (
          <section key={project.project_id} className={styles.project} aria-labelledby={`project-${project.project_id}`}>
            <header className={styles.projectHeader}>
              <h2 id={`project-${project.project_id}`} className={styles.projectName}>
                {project.project_id}
              </h2>
              {project.source_locale && (
                <span className={ui.muted}>{t('projects.source', { language: languageLabel(project.source_locale) })}</span>
              )}
            </header>
            <ul className={styles.locales}>
              {project.locales.map((locale) => (
                <LocaleRow key={locale.locale} projectId={project.project_id} locale={locale} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
