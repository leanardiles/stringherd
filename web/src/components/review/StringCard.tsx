import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import { StringEditor, type StringEditorProps } from './StringEditor'
import styles from './Review.module.css'

/** List view: the open string expands in place into a card (UI plan, decision 1). */
export const StringCard = forwardRef<HTMLElement, StringEditorProps>(function StringCard(props, ref) {
  const { t } = useTranslation()
  return (
    <section ref={ref} className={styles.card} aria-label={t('review.cardLabel', { number: props.number, key: props.item.key })}>
      <StringEditor {...props} />
    </section>
  )
})
