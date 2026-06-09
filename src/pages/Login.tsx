import { useState, useCallback, type CSSProperties } from 'react'
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { useAuth } from '@/contexts/AuthContext'
import { assets, getBackgroundStyle } from '@/config/assets'

const AUTH_PANEL_CSS = `.auth-card input::placeholder { color: var(--subtle); }
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
  const { signIn } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleGoogleSuccess = useCallback(
    (response: CredentialResponse) => {
      setError(null)
      if (!response.credential) {
        setSubmitting(false)
        setError('Google did not return a sign-in token. Please try again.')
        return
      }
      signIn(response.credential)
    },
    [signIn],
  )

  const handleGoogleError = useCallback(() => {
    setSubmitting(false)
    setError('Could not sign in with Google. Please try again.')
  }, [])

  return (
    <div className="auth-card" style={styles.wrapper}>
      <style>{AUTH_PANEL_CSS}</style>
      <div style={styles.leftPanel}>
        <img src={assets.logoUrl} alt="" width={48} height={48} style={styles.brandLogo} aria-hidden />
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

          <div style={styles.googleButtonWrap}>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              style={{
                ...styles.googleButton,
                opacity: submitting ? 0.7 : 1,
                pointerEvents: 'none',
              }}
            >
              <GoogleIcon />
              {submitting ? 'Signing in…' : 'Sign in with Google'}
            </button>
            <div
              style={styles.googleLoginOverlay}
              onPointerDown={() => setSubmitting(true)}
            >
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
                useOneTap={false}
                theme="outline"
                size="large"
                text="signin_with"
                width="320"
              />
            </div>
          </div>

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
    background: 'var(--bg, #f3f2ef)',
    padding: '1rem',
    boxSizing: 'border-box',
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
    borderRadius: 'var(--radius-xl, 16px)',
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    boxShadow: 'var(--shadow-2)',
  },
  brandLogo: {
    width: 48,
    height: 48,
    marginBottom: '1rem',
    borderRadius: '12px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
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
    background: 'var(--surface, #fff)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'auto',
    borderRadius: 'var(--radius-xl, 16px)',
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    border: '1px solid var(--line, #ddd8d1)',
    borderLeft: 'none',
    boxShadow: 'var(--shadow-2)',
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
    fontWeight: 700,
    letterSpacing: '-0.025em',
    color: 'var(--ink, #181614)',
    textAlign: 'center',
  },
  formSubtitle: {
    margin: '0 0 1.5rem',
    fontSize: '0.875rem',
    color: 'var(--muted, #736d66)',
    textAlign: 'center',
  },
  error: {
    marginBottom: '1rem',
    padding: '0.5rem 0.75rem',
    background: 'var(--bad-soft, #fef2f2)',
    color: 'var(--bad-ink, #b91c1c)',
    borderRadius: 'var(--radius, 8px)',
    fontSize: '0.8125rem',
  },
  googleButtonWrap: {
    position: 'relative',
    width: '100%',
    minHeight: '44px',
  },
  googleButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.625rem',
    width: '100%',
    padding: '0.75rem 1rem',
    background: 'var(--surface, #fff)',
    color: 'var(--ink, #181614)',
    border: '1px solid var(--line, #ddd8d1)',
    borderRadius: 'var(--radius, 8px)',
    fontSize: '0.9375rem',
    fontWeight: 600,
    boxShadow: 'var(--shadow-1)',
  },
  googleLoginOverlay: {
    position: 'absolute',
    inset: 0,
    opacity: 0.01,
    overflow: 'hidden',
    cursor: 'pointer',
  },
  hint: {
    margin: '1.25rem 0 0',
    fontSize: '0.75rem',
    color: 'var(--subtle, #a39e97)',
    textAlign: 'center',
    lineHeight: 1.4,
  },
}
