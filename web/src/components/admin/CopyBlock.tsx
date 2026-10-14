import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ui from '../ui.module.css'
import styles from './CopyBlock.module.css'

/** Copy to the clipboard and say so for two seconds. */
function useCopy(text: string) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  const copy = () => {
    void navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    )
  }
  return { copied, copy }
}

function CopyButton({ text, thing }: { text: string; thing: string }) {
  const { t } = useTranslation()
  const { copied, copy } = useCopy(text)
  return (
    <button type="button" className={ui.secondary} onClick={copy} aria-label={t('common.copyThing', { thing })}>
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      <span aria-live="polite">{copied ? t('common.copied') : t('common.copy')}</span>
    </button>
  )
}

/** A one-line value to copy, such as a new API key or a temporary password. */
export function CopyField({ value, label }: { value: string; label: string }) {
  return (
    <div className={styles.field}>
      <output className={styles.value} aria-label={label}>
        {value}
      </output>
      <CopyButton text={value} thing={label} />
    </div>
  )
}

/** A multi-line snippet to copy, such as a config block or shell commands, under its title. */
export function CodeBlock({ code, title, label }: { code: string; title: string; label: string }) {
  return (
    <div className={styles.block}>
      <div className={styles.blockHeader}>
        <h3 className={styles.blockTitle}>{title}</h3>
        <CopyButton text={code} thing={label} />
      </div>
      <pre className={styles.code} aria-label={label} tabIndex={0}>
        <code>{code}</code>
      </pre>
    </div>
  )
}
