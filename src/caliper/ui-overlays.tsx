// @ts-nocheck
/** Modal, sheet, and inline alert primitives with focus trap and Escape. */
import React from 'react'
import { IconBtn } from '@/caliper/ui'

function useFocusTrap(containerRef, active) {
  React.useEffect(() => {
    if (!active || !containerRef.current) return undefined
    const root = containerRef.current
    const focusable = root.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    first?.focus()

    const onKeyDown = (e) => {
      if (e.key === 'Tab' && focusable.length > 1) {
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }
    root.addEventListener('keydown', onKeyDown)
    return () => root.removeEventListener('keydown', onKeyDown)
  }, [active, containerRef])
}

export function Modal({
  open,
  onClose,
  title,
  titleId,
  children,
  className = '',
  width = 380,
}) {
  const panelRef = React.useRef(null)
  const headingId = titleId ?? React.useId()

  React.useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useFocusTrap(panelRef, open)

  if (!open) return null

  return (
    <div className="app-modal" onClick={onClose} role="presentation">
      <div
        ref={panelRef}
        className={`app-modal__panel ${className}`.trim()}
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? headingId : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="app-modal__head">
            <h2 id={headingId} className="app-modal__title">{title}</h2>
            <IconBtn icon="x" label="Close" onClick={onClose} />
          </div>
        )}
        <div className="app-modal__body">{children}</div>
      </div>
    </div>
  )
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  className = '',
  side = 'right',
}) {
  const panelRef = React.useRef(null)
  const headingId = React.useId()

  React.useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  useFocusTrap(panelRef, open)

  if (!open) return null

  return (
    <div className="app-sheet" onClick={onClose} role="presentation">
      <div
        ref={panelRef}
        className={`app-sheet__panel app-sheet__panel--${side} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? headingId : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="app-sheet__head">
            <h2 id={headingId} className="app-sheet__title">{title}</h2>
            <IconBtn icon="x" label="Close" onClick={onClose} />
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

export function Alert({
  tone = 'info',
  children,
  onDismiss,
  actions,
  className = '',
}) {
  return (
    <div className={`app-alert app-alert--${tone} ${className}`.trim()} role="alert">
      <div className="app-alert__content">{children}</div>
      {actions && <div className="app-alert__actions">{actions}</div>}
      {onDismiss && (
        <button type="button" className="app-alert__dismiss" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  )
}
