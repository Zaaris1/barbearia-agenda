import { useState } from 'react'
import Modal from './Modal'

export default function ConfirmModal({
  open,
  title = 'Confirmar acao',
  message,
  children,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'primary',
  onCancel,
  onConfirm,
}) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      await onConfirm?.()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      closeOnBackdrop
      footer={
        <>
          <button className="btn soft" type="button" onClick={onCancel} disabled={loading}>{cancelLabel}</button>
          <button className={`btn ${tone}`} type="button" onClick={handleConfirm} disabled={loading}>{loading ? 'Aguarde...' : confirmLabel}</button>
        </>
      }
    >
      <div className="confirm-modal-content">
        {children || <p>{message}</p>}
      </div>
    </Modal>
  )
}
