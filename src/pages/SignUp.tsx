import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { assets, getBackgroundStyle } from '@/config/assets'

const AUTH_PANEL_CSS = `.auth-card input::placeholder { color: #9ca3af; }
.auth-right-panel { overflow: auto; scrollbar-width: none; -ms-overflow-style: none; }
.auth-right-panel::-webkit-scrollbar { display: none; }`

export default function SignUp() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { signUp } = useAuth()

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setSubmitting(true)
    const { error: err } = await signUp(
      { email, password },
      {
        data: {
          first_name: firstName.trim() || undefined,
          last_name: lastName.trim() || undefined,
        },
      }
    )
    setSubmitting(false)
    if (err) {
      setError(err.message)
      return
    }
    setMessage(
      'Account created. If your project has email confirmation enabled, check your inbox. Otherwise you can sign in now.'
    )
  }, [signUp, firstName, lastName, email, password])

  return (
    <div className="auth-card" style={styles.wrapper}>
      <style>{AUTH_PANEL_CSS}</style>
      {/* Left panel */}
      <div style={styles.leftPanel}>
          <h1 style={styles.leftTitle}>Get Started with Us</h1>
          <p style={styles.leftSubtitle}>
            Complete these easy steps to register your account.
          </p>
        </div>

        {/* Right panel */}
        <div className="auth-right-panel" style={styles.rightPanel}>
          <div style={styles.rightPanelInner}>
          <h2 style={styles.formTitle}>Sign Up</h2>

          <form onSubmit={handleSubmit} style={styles.form}>
            {error && (
              <div style={styles.error} role="alert">
                {error}
              </div>
            )}
            {message && (
              <div style={styles.message} role="status">
                {message}
              </div>
            )}
            <div style={styles.nameRow}>
              <label style={styles.field}>
                <span style={styles.fieldLabel}>First Name</span>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                  autoComplete="given-name"
                  style={styles.input}
                />
              </label>
              <label style={styles.field}>
                <span style={styles.fieldLabel}>Last Name</span>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Francisco"
                  autoComplete="family-name"
                  style={styles.input}
                />
              </label>
            </div>
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
                  autoComplete="new-password"
                  minLength={8}
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
              <span style={styles.passwordHint}>Must be at least 8 characters.</span>
            </label>
            <button type="submit" disabled={submitting} style={styles.submitButton}>
              {submitting ? 'Creating account…' : 'Sign Up'}
            </button>
          </form>

          <p style={styles.footer}>
            Already have an account?{' '}
            <Link to="/login" style={styles.footerLink}>
              Login
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
    flex: 2,
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
    flex: 1,
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
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  nameRow: {
    display: 'flex',
    gap: '0.75rem',
  },
  error: {
    padding: '0.5rem 0.75rem',
    background: '#fef2f2',
    color: '#b91c1c',
    borderRadius: '0.5rem',
    fontSize: '0.8125rem',
  },
  message: {
    padding: '0.5rem 0.75rem',
    background: '#f0fdf4',
    color: '#166534',
    borderRadius: '0.5rem',
    fontSize: '0.8125rem',
  },
  field: {
    flex: 1,
    minWidth: 0,
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
  passwordHint: {
    fontSize: '0.6875rem',
    color: '#6b7280',
    marginTop: '0.125rem',
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
