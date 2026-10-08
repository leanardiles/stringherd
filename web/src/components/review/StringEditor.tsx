import { useTranslation } from 'react-i18next'
import type { ReviewString } from '../../api/client'
import { languageLabel } from '../../lib/languages'
import { countCharacters } from '../../lib/placeholders'
import type { QaIssue } from '../../lib/qa'
import { displayStatus } from '../../lib/review'
import { TargetEditor, type TargetEditorHandle } from '../editor/TargetEditor'
import { PlaceholderText } from '../PlaceholderText'
import ui from '../ui.module.css'
import { Diff } from './Diff'
import { StatusPill } from './StatusPill'
import styles from './StringEditor.module.css'

export interface StringEditorProps {
  number: number
  item: ReviewString
  value: string
  dirty: boolean
  issues: QaIssue[]
  sourceLang: string
  targetLang: string
  error: string | null
  editorRef: React.Ref<TargetEditorHandle>
  onChange: (value: string) => void
  onApproveNext: () => void
  onWithdraw: () => void
  onDiscard: () => void
  onInsertSuggestion: (text: string) => void
}

function QaMessage({ issue }: { issue: QaIssue }) {
  const { t } = useTranslation()
  const text = 'items' in issue ? t(`review.qa.${issue.code}`, { items: issue.items.join(' ') }) : t(`review.qa.${issue.code}`)
  return <li className={issue.severity === 'error' ? styles.qaError : styles.qaWarning}>{text}</li>
}

/**
 * Everything about the open string: header, source, target editor, suggestions, QA and actions.
 * Shared by the single key view (middle pane) and the list view (expanded card).
 */
export function StringEditor(props: StringEditorProps) {
  const { t } = useTranslation()
  const { number, item, value, dirty, issues, sourceLang, targetLang, error, editorRef } = props
  const status = displayStatus({ ...item, value, status: dirty ? 'machine_translated' : item.status })
  const deepl = item.machine_translation

  return (
    <div className={styles.editor}>
      <header className={styles.header}>
        <span className={`${styles.number} tabular`}>{number}</span>
        <span className="mono">{item.key}</span>
        {item.source_file && (
          <span className={`mono ${ui.muted} ${styles.file}`} title={item.source_file}>
            {item.source_file.split('/').pop()}
          </span>
        )}
        <span className={styles.spacer} />
        <span className={`${ui.muted} tabular`}>{t('review.chars', { count: countCharacters(value) })}</span>
        <StatusPill status={status} />
      </header>

      <div className={styles.block}>
        <span className={styles.label} title={languageLabel(sourceLang)}>
          {t('review.sourceLabel', { code: sourceLang.toUpperCase() })}
        </span>
        <div className={styles.source}>
          <PlaceholderText text={item.source_text ?? ''} lang={sourceLang} />
        </div>
      </div>

      <div className={styles.block}>
        <span className={styles.label} title={languageLabel(targetLang)}>
          {t('review.targetLabel', { code: targetLang.toUpperCase() })}
        </span>
        <TargetEditor
          key={item.key}
          ref={editorRef}
          value={value}
          onChange={props.onChange}
          ariaLabel={t('review.editorLabel', { language: languageLabel(targetLang) })}
          lang={targetLang}
          autoFocus
        />
      </div>

      {issues.length > 0 && (
        <div className={styles.block} role="status">
          <span className={styles.label}>{t('review.qa.title')}</span>
          <ul className={styles.qa}>
            {issues.map((issue) => (
              <QaMessage key={issue.code} issue={issue} />
            ))}
          </ul>
        </div>
      )}

      {deepl !== null && (
        <div className={styles.block}>
          <span className={styles.label}>{t('review.suggestions')}</span>
          <button
            type="button"
            className={styles.suggestion}
            onClick={() => props.onInsertSuggestion(deepl)}
            aria-label={t('review.insertSuggestion', { number: 1 })}
          >
            <span className={`${styles.suggestionNumber} tabular`}>1</span>
            <span className={styles.suggestionSource}>{t('review.deepl')}</span>
            <PlaceholderText text={deepl} lang={targetLang} />
          </button>
          {value !== deepl && (
            <div className={styles.changes}>
              <span className={styles.label}>{t('review.changesFromDeepl')}</span>
              <Diff before={deepl} after={value} lang={targetLang} />
            </div>
          )}
        </div>
      )}

      {error && (
        <div className={ui.alert} role="alert">
          {error}
        </div>
      )}

      <footer className={styles.actions}>
        <button type="button" className={ui.primary} onClick={props.onApproveNext}>
          {t('review.approveNext')} <kbd className={ui.kbd}>Ctrl+Enter</kbd>
        </button>
        {item.status === 'approved' && !dirty && (
          <button type="button" className={ui.secondary} onClick={props.onWithdraw}>
            {t('review.withdraw')}
          </button>
        )}
        {dirty && (
          <button type="button" className={ui.secondary} onClick={props.onDiscard}>
            {t('review.discard')} <kbd className={ui.kbd}>Esc</kbd>
          </button>
        )}
        {item.status === 'approved' && !dirty && item.approved_by && (
          <span className={`${ui.muted} ${styles.approvedBy}`}>{t('review.approvedBy', { name: item.approved_by })}</span>
        )}
      </footer>
    </div>
  )
}
