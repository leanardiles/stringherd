import { useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ImportMode, ProjectAdminDetail } from '../../api/client'
import { useAddLocale, useUpdateImportMode } from '../../api/queries'
import { searchDeeplLanguages, isDeeplTarget } from '../../lib/deeplLanguages'
import { errorMessage } from '../../lib/errors'
import { languageLabel } from '../../lib/languages'
import { isLocaleCode } from '../../lib/locales'
import { Dialog } from '../Dialog'
import ui from '../ui.module.css'
import styles from './AddLanguageDialog.module.css'

/** The answers to "does the repository already have translations?"; null is "No". */
const ANSWERS = [null, 'retranslate', 'review', 'reviewed'] as const satisfies readonly (ImportMode | null)[]
type Answer = (typeof ANSWERS)[number]

/**
 * Add a language in two questions: which language (from DeepL's languages, or another code),
 * and whether the repository already has translations for it.
 */
export function AddLanguageDialog({
  project,
  open,
  onOpenChange,
}: {
  project: ProjectAdminDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const add = useAddLocale(project.project_id)
  const [code, setCode] = useState<string | null>(null)
  const [answer, setAnswer] = useState<Answer>(null)

  function close() {
    onOpenChange(false)
    setCode(null)
    setAnswer(null)
    add.reset()
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!code) return
    add.mutate({ locale: code, importMode: answer }, { onSuccess: close })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={t('admin.project.addLanguage.title')}
      footer={
        <>
          <button type="button" className={ui.secondary} onClick={close}>
            {t('common.cancel')}
          </button>
          <button type="submit" form="add-language" className={ui.primary} disabled={!code || add.isPending}>
            {add.isPending ? t('admin.project.addLanguage.submitting') : t('admin.project.addLanguage.submit')}
          </button>
        </>
      }
    >
      <form id="add-language" className={styles.form} onSubmit={submit}>
        {add.error && (
          <div className={ui.alert} role="alert">
            {errorMessage(add.error, t)}
          </div>
        )}
        <LanguagePicker project={project} value={code} onChange={setCode} />
        {code && <AnswerChoice language={languageLabel(code)} value={answer} onChange={setAnswer} />}
      </form>
    </Dialog>
  )
}

/** Change the answer for a language that has no strings yet. */
export function ChangeAnswerDialog({
  projectId,
  locale,
  current,
  onClose,
}: {
  projectId: string
  locale: string
  current: ImportMode | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const update = useUpdateImportMode(projectId)
  const [answer, setAnswer] = useState<Answer>(current)
  const language = languageLabel(locale)
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('admin.project.addLanguage.changeTitle', { language })}
      footer={
        <>
          <button type="button" className={ui.secondary} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" form="change-answer" className={ui.primary} disabled={update.isPending}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <form
        id="change-answer"
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault()
          update.mutate({ locale, importMode: answer }, { onSuccess: onClose })
        }}
      >
        {update.error && (
          <div className={ui.alert} role="alert">
            {errorMessage(update.error, t)}
          </div>
        )}
        <AnswerChoice language={language} value={answer} onChange={setAnswer} />
      </form>
    </Dialog>
  )
}

function AnswerChoice({ language, value, onChange }: { language: string; value: Answer; onChange: (answer: Answer) => void }) {
  const { t } = useTranslation()
  return (
    <fieldset className={styles.answers}>
      <legend className={ui.label}>{t('admin.project.addLanguage.question', { language })}</legend>
      {ANSWERS.map((answer) => {
        const key = answer ?? 'none'
        return (
          <label key={key} className={styles.answer}>
            <input type="radio" name="existing" checked={value === answer} onChange={() => onChange(answer)} />
            <span>
              {t(`admin.project.addLanguage.answers.${key}.label`)}
              <span className={styles.answerHint}>{t(`admin.project.addLanguage.answers.${key}.hint`)}</span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

interface Choice {
  code: string
  name: string
  region?: string
  /** Not in DeepL's list: typed by the admin. */
  other?: boolean
  /** Why it can't be chosen: already in the project, or the source language. */
  unavailable?: string
}

/**
 * A searchable list of the languages DeepL translates into, as an accessible combobox. A valid
 * code that isn't in the list can still be used ("Another code"), with a warning.
 */
function LanguagePicker({
  project,
  value,
  onChange,
}: {
  project: ProjectAdminDetail
  value: string | null
  onChange: (code: string | null) => void
}) {
  const { t, i18n } = useTranslation()
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const choices = useMemo<Choice[]>(() => {
    const taken = new Set(project.target_locales.map((code) => code.toLowerCase()))
    const source = project.source_locale?.toLowerCase()
    const why = (code: string) =>
      taken.has(code.toLowerCase())
        ? t('admin.project.addLanguage.alreadyAdded')
        : code.toLowerCase() === source
          ? t('admin.project.addLanguage.isSource')
          : undefined
    const found: Choice[] = searchDeeplLanguages(query, i18n.language).map((option) => ({
      ...option,
      unavailable: why(option.code),
    }))
    const typed = query.trim()
    if (isLocaleCode(typed) && !isDeeplTarget(typed) && (found.length === 0 || /[-_]/.test(typed))) {
      found.push({ code: typed, name: typed, other: true, unavailable: why(typed) })
    }
    return found
  }, [query, project, t, i18n.language])

  if (value) {
    return (
      <div className={ui.field}>
        <span className={ui.label}>{t('admin.project.addLanguage.language')}</span>
        <div className={styles.chosen}>
          <span>{languageLabel(value)}</span>
          <button
            type="button"
            className={ui.quiet}
            onClick={() => {
              onChange(null)
              requestAnimationFrame(() => input.current?.focus())
            }}
          >
            {t('admin.project.addLanguage.change')}
          </button>
        </div>
        {!isDeeplTarget(value) && <span className={ui.hint}>{t('admin.project.addLanguage.otherCodeHint')}</span>}
      </div>
    )
  }

  const listId = `${id}-list`
  const optionId = (index: number) => `${id}-option-${index}`
  const choose = (choice: Choice | undefined) => {
    if (choice && !choice.unavailable) onChange(choice.code)
  }
  const move = (step: number) => {
    if (choices.length === 0) return
    setActive((current) => (current + step + choices.length) % choices.length)
  }

  return (
    <div className={ui.field}>
      <label className={ui.label} htmlFor={`${id}-search`}>
        {t('admin.project.addLanguage.language')}
      </label>
      <input
        ref={input}
        id={`${id}-search`}
        className={ui.input}
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={choices.length ? optionId(active) : undefined}
        value={query}
        placeholder={t('admin.project.addLanguage.searchPlaceholder')}
        autoComplete="off"
        spellCheck={false}
        autoFocus
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            move(1)
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            move(-1)
          } else if (event.key === 'Enter') {
            event.preventDefault()
            choose(choices[active])
          }
        }}
      />
      <ul id={listId} role="listbox" className={styles.list} aria-label={t('admin.project.addLanguage.listLabel')}>
        {choices.map((choice, index) => (
          <li
            key={`${choice.code}${choice.other ? '-other' : ''}`}
            id={optionId(index)}
            role="option"
            aria-selected={index === active}
            aria-disabled={choice.unavailable ? true : undefined}
            className={styles.option}
            onMouseEnter={() => setActive(index)}
            onMouseDown={(event) => event.preventDefault()} // keep the focus in the search field
            onClick={() => choose(choice)}
          >
            {choice.other ? (
              <span className={styles.optionName}>{t('admin.project.addLanguage.otherCode', { code: choice.code })}</span>
            ) : (
              <span className={styles.optionName}>
                {choice.name} <span className="mono">({choice.code})</span>
                {choice.region && <span className={styles.optionRegion}> · {choice.region}</span>}
              </span>
            )}
            {choice.unavailable && <span className={styles.optionNote}>{choice.unavailable}</span>}
          </li>
        ))}
      </ul>
      {choices.length === 0 && <p className={styles.noMatch}>{t('admin.project.addLanguage.noMatch')}</p>}
    </div>
  )
}
