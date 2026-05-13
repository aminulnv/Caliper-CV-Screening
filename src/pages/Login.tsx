import { useState, useCallback } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { assets, getBackgroundStyle } from '@/config/assets'

const AUTH_PANEL_CSS = `.auth-card input::placeholder { color: #9ca3af; }
.auth-right-panel { overflow: auto; scrollbar-width: none; -ms-overflow-style: none; }
.auth-right-panel::-webkit-scrollbar { display: none; }`

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { signInWithPassword, isDummyAuth, enterDevDummySession } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/'

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: err } = await signInWithPassword({ email, password })
    setSubmitting(false)
    if (err) {
      setError(err.message)
      return
    }
    navigate(from, { replace: true })
  }, [signInWithPassword, navigate, from, email, password])

  return (
    <div className="auth-card" style={styles.wrapper}>
      <style>{AUTH_PANEL_CSS}</style>
      {/* Left panel */}
      <div style={styles.leftPanel}>
          <h1 style={styles.leftTitle}>Welcome back</h1>
          <p style={styles.leftSubtitle}>
            Sign in to continue to your account.
          </p>
        </div>

        {/* Right panel */}
        <div className="auth-right-panel" style={styles.rightPanel}>
          <div style={styles.rightPanelInner}>
          <h2 style={styles.formTitle}>Login</h2>

          {isDummyAuth && (
            <div style={styles.dummyBanner} role="note">
              <strong>Dummy auth</strong> — Supabase is skipped. Use the button below or sign in with any email and
              password.
            </div>
          )}

          {isDummyAuth && (
            <button
              type="button"
              onClick={() => {
                enterDevDummySession()
                navigate(from, { replace: true })
              }}
              style={styles.dummyButton}
            >
              Open app without Supabase
            </button>
          )}

          <form onSubmit={handleSubmit} style={styles.form}>
            {error && (
              <div style={styles.error} role="alert">
                {error}
              </div>
            )}
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="johnfrans@gmail.com"
                required
                autoComplete="email"
                style={styles.input}
              />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Password</span>
              <div style={styles.passwordWrap}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  style={styles.inputPassword}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  style={styles.eyeButton}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff size={18} color="#6b7280" strokeWidth={1.75} />
                  ) : (
                    <Eye size={18} color="#6b7280" strokeWidth={1.75} />
                  )}
                </button>
              </div>
            </label>
            <div style={styles.forgotRow}>
              <Link to="/forgot-password" style={styles.forgotLink}>
                Forgot password?
              </Link>
            </div>
            <button type="submit" disabled={submitting} style={styles.submitButton}>
              {submitting ? 'Signing in…' : 'Login'}
            </button>
          </form>

          <p style={styles.footer}>
            Don&apos;t have an account?{' '}
            <Link to="/signup" style={styles.footerLink}>
              Sign Up
            </Link>
          </p>
          </div>
        </div>
    </div>
  )
}

const inputBase: React.CSSProperties = {
  width: '100%',
  padding: '0.625rem 0.75rem',
  background: '#f9fafb',
  border: '0.0625rem solid #e5e7eb',
  borderRadius: '0.5rem',
  fontSize: '0.875rem',
  color: '#111827',
  boxSizing: 'border-box',
}

const styles: Record<string, React.CSSProperties> = {
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
    fontSize: '1.05rem',
    fontWeight: 400,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 1.25,
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
  },
  formTitle: {
    margin: '0 0 1rem',
    fontSize: '1.75rem',
    fontWeight: 800,
    color: '#111827',
    textAlign: 'center',
  },
  dummyBanner: {
    marginBottom: '1rem',
    padding: '0.75rem 0.875rem',
    fontSize: '0.8125rem',
    lineHeight: 1.45,
    color: '#1e3a2f',
    background: '#ecfdf5',
    border: '1px solid #a7f3d0',
    borderRadius: '0.5rem',
  },
  dummyButton: {
    width: '100%',
    marginBottom: '1rem',
    padding: '0.65rem 1rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#065f46',
    background: '#d1fae5',
    border: '1px solid #6ee7b7',
    borderRadius: '0.5rem',
    cursor: 'pointer',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  error: {
    padding: '0.5rem 0.75rem',
    background: '#fef2f2',
    color: '#b91c1c',
    borderRadius: '0.5rem',
    fontSize: '0.8125rem',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  fieldLabel: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#374151',
  },
  input: inputBase,
  inputPassword: { ...inputBase, paddingRight: '2.5rem' },
  passwordWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  eyeButton: {
    position: 'absolute',
    right: '0.5rem',
    top: '50%',
    transform: 'translateY(-50%)',
    padding: '0.25rem',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotRow: {
    marginTop: '-0.25rem',
  },
  forgotLink: {
    fontSize: '0.8125rem',
    color: '#171717',
    textDecoration: 'underline',
  },
  submitButton: {
    marginTop: '0.5rem',
    padding: '0.75rem 1rem',
    background: '#171717',
    color: '#fff',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.9375rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  footer: {
    margin: '1.5rem 0 0',
    fontSize: '0.8125rem',
    color: '#6b7280',
  },
  footerLink: {
    color: '#171717',
    fontWeight: 700,
    textDecoration: 'underline',
  },
}
