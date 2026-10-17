import { useTranslation } from 'react-i18next'
import { languageParts } from '../lib/languages'
import styles from './LanguageName.module.css'

/** A language on two lines: name and code, then the region when there is one. */
export function LanguageName({ code }: { code: string }) {
  useTranslation() // re-render when the UI language changes, since the names follow it
  const { name, region } = languageParts(code)
  return (
    <span className={styles.language}>
      <span>{name === code ? code : `${name} (${code})`}</span>
      {region && <span className={styles.region}>{region}</span>}
    </span>
  )
}
