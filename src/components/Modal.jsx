import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useId } from 'react'

export default function Modal({ open, title, children, onClose, footer, closeOnBackdrop = false }) {
  const titleId = useId()

  useEffect(() => {
    if (!open || !onClose) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  function handleBackdropMouseDown(event) {
    if (closeOnBackdrop && event.target === event.currentTarget) onClose?.()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={handleBackdropMouseDown}>
          <motion.div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.18 }}
          >
            <div className="modal-header">
              <h3 id={titleId}>{title}</h3>
              <button type="button" className="ghost-icon" onClick={onClose} aria-label="Fechar modal">
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-footer">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
