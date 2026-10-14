import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import ui from './ui.module.css'
import styles from './Dialog.module.css'

type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  children?: React.ReactNode
  /** Buttons at the bottom, end-aligned. */
  footer?: React.ReactNode
  /** Keep the dialog open on Esc and outside clicks, e.g. while a secret is shown. */
  modalStrict?: boolean
  /** Wider, for reference content such as the shortcuts list. */
  wide?: boolean
}

/** Accessible modal dialog: focus moves in and back, Esc closes, the page behind is inert. */
export function Dialog({ open, onOpenChange, title, description, children, footer, modalStrict, wide }: DialogProps) {
  const { t } = useTranslation()
  const block = modalStrict ? (event: Event) => event.preventDefault() : undefined
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles.overlay} />
        <RadixDialog.Content
          className={`${styles.content} ${wide ? styles.wide : ''}`}
          onEscapeKeyDown={block}
          onPointerDownOutside={block}
          onInteractOutside={block}
        >
          <header className={styles.header}>
            <RadixDialog.Title className={styles.title}>{title}</RadixDialog.Title>
            {!modalStrict && (
              <RadixDialog.Close className={ui.quiet} aria-label={t('common.close')}>
                <X size={16} aria-hidden="true" />
              </RadixDialog.Close>
            )}
          </header>
          {description ? (
            <RadixDialog.Description className={styles.description}>{description}</RadixDialog.Description>
          ) : (
            <RadixDialog.Description className="visually-hidden">{title}</RadixDialog.Description>
          )}
          {children && <div className={styles.body}>{children}</div>}
          {footer && <footer className={styles.footer}>{footer}</footer>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

type ConfirmProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  body: React.ReactNode
  confirmLabel: string
  onConfirm: () => void
  pending?: boolean
  error?: string | null
}

/** "Are you sure?" for actions that can't be undone. The confirm button is styled as dangerous. */
export function ConfirmDialog({ open, onOpenChange, title, body, confirmLabel, onConfirm, pending, error }: ConfirmProps) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={body}
      footer={
        <>
          <button type="button" className={ui.secondary} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </button>
          <button type="button" className={ui.danger} onClick={onConfirm} disabled={pending}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {error && (
        <div className={ui.alert} role="alert">
          {error}
        </div>
      )}
    </Dialog>
  )
}
