import { CheckCircle2, AlertCircle, X } from 'lucide-react'

export default function Toast({ toast, onClose }) {
  if (!toast) return null
  const Icon = toast.type === 'error' ? AlertCircle : CheckCircle2
  return (
    <div className={`toast ${toast.type === 'error' ? 'toast-error' : 'toast-success'}`}>
      <Icon size={18} />
      <span>{toast.message}</span>
      <button type="button" className="ghost-icon" onClick={onClose} aria-label="Fechar aviso">
        <X size={16} />
      </button>
    </div>
  )
}
