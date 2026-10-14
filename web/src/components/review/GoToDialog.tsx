import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog } from '../Dialog'
import { findString } from '../../lib/review'
import ui from '../ui.module.css'

interface Props {
  /** Every key of the language, in list order (string number = position + 1). */
  keys: string[]
  onGo: (key: string) => void
  onClose: () => void
}

/** Ctrl+G: jump to a string by number or key, as Phrase's "Go to segment". */
export function GoToDialog({ keys, onGo, onClose }: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [notFound, setNotFound] = useState(false)

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('review.goTo.title')}
      footer={
        <>
          <button type="button" className={ui.secondary} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" form="go-to" className={ui.primary}>
            {t('review.goTo.submit')}
          </button>
        </>
      }
    >
      <form
        id="go-to"
        onSubmit={(event) => {
          event.preventDefault()
          const key = findString(keys, query)
          if (key) onGo(key)
          else setNotFound(true)
        }}
      >
        <div className={ui.field}>
          <label className={ui.label} htmlFor="go-to-query">
            {t('review.goTo.label')}
          </label>
          <input
            className={`${ui.input} mono`}
            id="go-to-query"
            list="go-to-keys"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setNotFound(false)
            }}
            placeholder={t('review.goTo.placeholder')}
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
          <datalist id="go-to-keys">
            {keys.slice(0, 1000).map((key) => (
              <option key={key} value={key} />
            ))}
          </datalist>
        </div>
        {notFound && (
          <p className={ui.alert} role="alert">
            {t('review.goTo.notFound', { query: query.trim() })}
          </p>
        )}
      </form>
    </Dialog>
  )
}
