// @ts-nocheck
import React from 'react'
import { Icon } from '@/caliper/ui'

/**
 * Shared toast for transient success/error feedback.
 * @typedef {{ message: string, tone?: 'ok' | 'bad' | 'default', actionLabel?: string, onAction?: () => void }} ToastState
 */

export function useToast() {
  const [toast, setToast] = React.useState(null)

  const showToast = React.useCallback((next) => {
    setToast(next)
  }, [])

  const dismissToast = React.useCallback(() => {
    setToast(null)
  }, [])

  return { toast, showToast, dismissToast }
}

export function AppToast({ toast, onDismiss }) {
  React.useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(onDismiss, 4500)
    return () => window.clearTimeout(timer)
  }, [toast, onDismiss])

  if (!toast) return null

  const tone = toast.tone ?? 'default'

  return (
    <div
      className={`app-toast app-toast--${tone}`}
      role="status"
      aria-live="polite"
    >
      <span>{toast.message}</span>
      {toast.actionLabel && toast.onAction && (
        <button type="button" className="app-toast__action" onClick={toast.onAction}>
          {toast.actionLabel}
        </button>
      )}
      <button
        type="button"
        className="app-toast__dismiss"
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        <Icon name="x" size={14} aria-hidden />
      </button>
    </div>
  )
}
