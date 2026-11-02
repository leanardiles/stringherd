import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LanguageImport, ProjectLocaleAdmin } from '../../api/client'
import { useFinishImport } from '../../api/queries'
import { errorMessage } from '../../lib/errors'
import { languageLabel } from '../../lib/languages'
import { Dialog } from '../Dialog'
import ui from '../ui.module.css'
import { CopyField } from './CopyBlock'
import { ChangeAnswerDialog } from './AddLanguageDialog'
import styles from './LanguageImportPanel.module.css'

/**
 * The steps that happen in the repository, under a language's row. Stringherd can't see the
 * repository, so it shows the next command and confirms what has arrived.
 */
export function LanguageImportPanel({
  projectId,
  locale,
  onFinished,
}: {
  projectId: string
  locale: ProjectLocaleAdmin
  onFinished: (locale: string) => void
}) {
  const { t } = useTranslation()
  const [changing, setChanging] = useState(false)
  const state = locale.existing_translations as LanguageImport
  const code = locale.locale
  const language = languageLabel(code)

  return (
    <div className={styles.panel}>
      {state.mode === 'retranslate' ? (
        <>
          <h3 className={styles.title}>{t('admin.project.import.retranslateTitle', { language })}</h3>
          <p className={ui.hint}>{t('admin.project.import.whereRetranslate')}</p>
          <ol className={styles.steps}>
            <li>{t('admin.project.import.stepYaml', { code })}</li>
            <li>
              <p className={styles.stepText}>
                {state.estimated_characters
                  ? t('admin.project.import.stepTranslate', { count: state.estimated_characters })
                  : t('admin.project.import.stepTranslateUnknown')}
              </p>
              <CopyField
                value={`deepl sync --force --locale ${code}`}
                label={t('admin.project.import.translateCommand', { language })}
              />
            </li>
            <li>
              <p className={styles.stepText}>{t('admin.project.import.stepPushReview')}</p>
              <CopyField
                value={`deepl sync push --locale ${code}`}
                label={t('admin.project.import.pushCommand', { language })}
              />
            </li>
          </ol>
          <p className={ui.hint}>{t('admin.project.import.retranslateWaiting')}</p>
        </>
      ) : (
        <>
          <h3 className={styles.title}>{t('admin.project.import.title', { language })}</h3>
          <p className={ui.hint}>{t('admin.project.import.where')}</p>
          <ol className={styles.steps}>
            <li>{t('admin.project.import.stepYaml', { code })}</li>
            <li>
              <p className={styles.stepText}>{t('admin.project.import.stepPush')}</p>
              <CopyField
                value={`deepl sync push --locale ${code}`}
                label={t('admin.project.import.pushCommand', { language })}
              />
              <p className={styles.warning}>
                <TriangleAlert size={14} aria-hidden="true" />
                <span>{t('admin.project.import.warning')}</span>
              </p>
            </li>
            <li>
              <Arrived state={state} />
            </li>
            <li>
              <p className={styles.stepText}>{t('admin.project.import.stepFinish')}</p>
              <FinishImport projectId={projectId} locale={code} arrived={state.imported} onFinished={onFinished} />
            </li>
          </ol>
        </>
      )}
      {locale.total === 0 && (
        <p className={styles.change}>
          <button type="button" className={ui.quiet} onClick={() => setChanging(true)}>
            {t('admin.project.import.changeAnswer')}
          </button>
        </p>
      )}
      {changing && (
        <ChangeAnswerDialog projectId={projectId} locale={code} current={state.mode} onClose={() => setChanging(false)} />
      )}
    </div>
  )
}

/** How many strings have arrived, per file. Refreshes by itself while the import is open. */
function Arrived({ state }: { state: LanguageImport }) {
  const { t } = useTranslation()
  if (state.imported === 0) return <span aria-live="polite">{t('admin.project.import.arrivedNone')}</span>
  return (
    <div aria-live="polite">
      <strong>{t('admin.project.import.arrived', { count: state.imported })}</strong>
      <ul className={styles.files}>
        {state.files.map((file) => (
          <li key={file.file ?? ''}>
            {t('admin.project.import.fileCount', { count: file.keys, strings: file.strings })}
            {' · '}
            {file.file ? <span className="mono">{file.file}</span> : t('admin.project.import.noFile')}
          </li>
        ))}
      </ul>
    </div>
  )
}

function FinishImport({
  projectId,
  locale,
  arrived,
  onFinished,
}: {
  projectId: string
  locale: string
  arrived: number
  onFinished: (locale: string) => void
}) {
  const { t } = useTranslation()
  const finish = useFinishImport(projectId)
  const [open, setOpen] = useState(false)
  const language = languageLabel(locale)

  function close() {
    setOpen(false)
    finish.reset()
  }

  return (
    <div className={styles.finish}>
      <button type="button" className={ui.primary} disabled={arrived === 0} onClick={() => setOpen(true)}>
        {t('admin.project.import.finish')}
      </button>
      {arrived === 0 && <span className={ui.hint}>{t('admin.project.import.finishWaiting')}</span>}
      <Dialog
        open={open}
        onOpenChange={(next) => !next && close()}
        title={t('admin.project.import.finishTitle', { language })}
        description={t('admin.project.import.finishBody', { count: arrived, language })}
        footer={
          <>
            <button type="button" className={ui.secondary} onClick={close}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className={ui.primary}
              disabled={finish.isPending}
              // The row closes its steps once the import is finished, so the last step is shown by the page.
              onClick={() => finish.mutate(locale, { onSuccess: () => onFinished(locale) })}
            >
              {t('admin.project.import.finish')}
            </button>
          </>
        }
      >
        {finish.error && (
          <div className={ui.alert} role="alert">
            {errorMessage(finish.error, t)}
          </div>
        )}
      </Dialog>
    </div>
  )
}

/** After Finish import: the last step, in the repository. */
export function PullStepDialog({ locale, onClose }: { locale: string; onClose: () => void }) {
  const { t } = useTranslation()
  const language = languageLabel(locale)
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('admin.project.import.doneTitle', { language })}
      description={t('admin.project.import.doneBody', { language })}
      footer={
        <button type="button" className={ui.primary} onClick={onClose}>
          {t('common.done')}
        </button>
      }
    >
      <CopyField value={`deepl sync pull --locale ${locale}`} label={t('admin.project.import.pullCommand', { language })} />
      <p className={ui.hint}>{t('admin.project.import.doneHint', { language })}</p>
    </Dialog>
  )
}
