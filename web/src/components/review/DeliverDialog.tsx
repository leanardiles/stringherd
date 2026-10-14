import { useTranslation } from 'react-i18next'
import { Dialog } from '../Dialog'
import ui from '../ui.module.css'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  language: string
  /** Approved strings that this Deliver sends. */
  approved: number
  /** Strings still in review, which keep their current text in the code. */
  notApproved: number
  /** Key of an unsaved edit in the editor, if any; it is saved as an edit, not delivered. */
  unsavedKey: string | null
  pending: boolean
  error: string | null
  onConfirm: () => void
}

/** Confirms a delivery: what goes to the repository, and what stays behind. */
export function DeliverDialog(props: Props) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('review.deliver.title', { language: props.language })}
      description={t('review.deliver.body', { count: props.approved })}
      footer={
        <>
          <button type="button" className={ui.secondary} onClick={() => props.onOpenChange(false)}>
            {t('common.cancel')}
          </button>
          <button type="button" className={ui.primary} onClick={props.onConfirm} disabled={props.pending}>
            {props.pending ? t('review.deliver.delivering') : t('review.deliver.count', { count: props.approved })}
          </button>
        </>
      }
    >
      {props.notApproved > 0 && <p className={ui.hint}>{t('review.deliver.notApproved', { count: props.notApproved })}</p>}
      {props.unsavedKey && <p className={ui.hint}>{t('review.deliver.unsaved', { key: props.unsavedKey })}</p>}
      {props.error && (
        <div className={ui.alert} role="alert">
          {props.error}
        </div>
      )}
    </Dialog>
  )
}
