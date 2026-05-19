import { useState, useCallback, type CSSProperties } from 'react'
import { signInWithGoogle } from '@/lib/auth'
import { assets, getBackgroundStyle } from '@/config/assets'

const AUTH_PANEL_CSS = `.auth-card input::placeholder { color: #9ca3af; }
.auth-right-panel { overflow: auto; scrollbar-width: none; -ms-overflow-style: none; }
.auth-right-panel::-webkit-scrollbar { display: none; }`

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.98 13.72 18.05 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.56 2.95-2.24 5.45-4.78 7.14l7.73 6c4.51-4.16 7.12-10.27 7.12-17.61z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C2.38 16.49 0 20.02 0 24c0 3.98.92 7.74 2.56 11.22l7.97-6.63z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.17 2.3-5.95 0-10.99-4.02-12.8-9.42l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

export default function Login() {
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleGoogleSignIn = useCallback(async () => {
    setError(null)
    setSubmitting(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      setSubmitting(false)
      setError(err instanceof Error ? err.message : 'Could not start sign-in. Please try again.')
    }
  }, [])

  return (
    <div className="auth-card" style={styles.wrapper}>
      <style>{AUTH_PANEL_CSS}</style>
      <div style={styles.leftPanel}>
        <h1 style={styles.leftTitle}>Caliper</h1>
        <p style={styles.leftSubtitle}>
          AI-powered CV screening for your hiring team. Sign in with your company Google account to continue.
        </p>
      </div>

      <div className="auth-right-panel" style={styles.rightPanel}>
        <div style={styles.rightPanelInner}>
          <h2 style={styles.formTitle}>Welcome</h2>
          <p style={styles.formSubtitle}>Sign in to access your workspace</p>

          {error && (
            <div style={styles.error} role="alert">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={submitting}
            style={{
              ...styles.googleButton,
              opacity: submitting ? 0.7 : 1,
              cursor: submitting ? 'wait' : 'pointer',
            }}
          >
            <GoogleIcon />
            {submitting ? 'Redirecting to Google…' : 'Sign in with Google'}
          </button>

          <p style={styles.hint}>Use your @nextventures.io or other approved company email.</p>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrapper: {
    position: 'fixed',
    inset: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    overflow: 'hidden',
    background: '#e5e7eb',
    padding: '0.5rem',
    boxSizing: 'border-box',
    borderRadius: '0.75rem',
  },
  leftPanel: {
    flex: 7,
    minWidth: 0,
    padding: '2.5rem 2rem',
    ...getBackgroundStyle(assets.loginBackgroundValue),
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '0.5rem',
    minHeight: 0,
    overflow: 'hidden',
    borderRadius: '0.5rem',
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  leftTitle: {
    margin: 0,
    fontSize: '3.5rem',
    fontWeight: 700,
    color: '#fff',
    lineHeight: 1.1,
  },
  leftSubtitle: {
    margin: 0,
    maxWidth: '28rem',
    fontSize: '1.05rem',
    fontWeight: 400,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 1.4,
  },
  rightPanel: {
    flex: 3,
    minWidth: 0,
    minHeight: 0,
    padding: '2.5rem 2rem',
    background: '#fff',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'auto',
    borderRadius: '0.5rem',
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  rightPanelInner: {
    flex: 1,
    minHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'stretch',
    maxWidth: '20rem',
    margin: '0 auto',
    width: '100%',
  },
  formTitle: {
    margin: '0 0 0.25rem',
    fontSize: '1.75rem',
    fontWeight: 800,
    color: '#111827',
    textAlign: 'center',
  },
  formSubtitle: {
    margin: '0 0 1.5rem',
    fontSize: '0.875rem',
    color: '#6b7280',
    textAlign: 'center',
  },
  error: {
    marginBottom: '1rem',
    padding: '0.5rem 0.75rem',
    background: '#fef2f2',
    color: '#b91c1c',
    borderRadius: '0.5rem',
    fontSize: '0.8125rem',
  },
  googleButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.625rem',
    width: '100%',
    padding: '0.75rem 1rem',
    background: '#fff',
    color: '#111827',
    border: '0.0625rem solid #e5e7eb',
    borderRadius: '0.5rem',
    fontSize: '0.9375rem',
    fontWeight: 600,
    boxShadow: '0 0.0625rem 0.125rem rgba(0,0,0,0.05)',
  },
  hint: {
    margin: '1.25rem 0 0',
    fontSize: '0.75rem',
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 1.4,
  },
}
