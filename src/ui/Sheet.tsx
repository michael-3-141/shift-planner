import { useEffect, useRef, type ReactNode } from 'react'
import { t } from '../i18n'
import { Icon } from './Icon'

/** A modal that is a bottom sheet on phones and a centered dialog on wider screens. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className="sheet"
      onCancel={e => { e.preventDefault(); onClose() }}
      // A click on the dialog element itself is a click on the backdrop.
      onClick={e => e.target === ref.current && onClose()}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon" aria-label={t().common.close} onClick={onClose}><Icon name="close" /></button>
      </header>
      <div className="sheet-body">{children}</div>
    </dialog>
  )
}
