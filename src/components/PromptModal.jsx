import { useEffect, useState } from 'react'
import Modal from './Modal'

export default function PromptModal({
  open,
  title = 'Adicionar observacao',
  label = 'Observacao',
  defaultValue = '',
  placeholder = '',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  rows = 3,
  onCancel,
  onConfirm,
}) {
  const [value, setValue] = useState(defaultValue)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) setValue(defaultValue || '')
  }, [defaultValue, open])

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    try {
      await onConfirm?.(value)
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
          <button className="btn primary" type="submit" form="prompt-modal-form" disabled={loading}>{loading ? 'Aguarde...' : confirmLabel}</button>
        </>
      }
    >
      <form id="prompt-modal-form" className="form-stack prompt-modal-form" onSubmit={handleSubmit}>
        <label>
          <span>{label}</span>
          <textarea value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} rows={rows} autoFocus />
        </label>
      </form>
    </Modal>
  )
}
