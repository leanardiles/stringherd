import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import ui from '../components/ui.module.css'
import { languageLabel } from '../lib/languages'
import styles from './ReviewPage.module.css'

// Placeholder until the string list with the expanding card is built (UI plan, phase MVP step 3).
export function ReviewPage() {
  const { t } = useTranslation()
  const { projectId = '', locale = '' } = useParams()
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>
        {projectId} › {languageLabel(locale)}
      </h1>
      <p className={ui.muted}>{t('review.comingNext')}</p>
      <Link to="/" className={ui.secondary}>
        {t('review.backToProjects')}
      </Link>
    </div>
  )
}
