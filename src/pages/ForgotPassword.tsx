import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { resetPasswordForEmail } = useAuth()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: err } = await resetPasswordForEmail(email)
    setSubmitting(false)
    if (err) {
      setError(err.message)
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Check your email</h1>
          <p style={styles.text}>
            If an account exists for <strong>{email}</strong>, you will receive a link to reset your
            password.
          </p>
          <p style={styles.footer}>
            <Link to="/login" style={styles.link}>
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Forgot password</h1>
        <form onSubmit={handleSubmit} style={styles.form}>
          {error && (
            <div style={styles.error} role="alert">
              {error}
            </div>
          )}
          <label style={styles.label}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={styles.input}
            />
          </label>
          <button type="submit" disabled={submitting} style={styles.button}>
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
        <p style={styles.footer}>
          <Link to="/login" style={styles.link}>
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
  },
  card: {
    width: '100%',
    maxWidth: '22.5rem',
    padding: '1.5rem',
    border: '0.0625rem solid #e0e0e0',
    borderRadius: '0.5rem',
    background: '#fff',
  },
  title: {
    margin: '0 0 1.25rem',
    fontSize: '1.5rem',
    fontWeight: 600,
  },
  text: {
    margin: '0 0 1rem',
    fontSize: '0.9375rem',
    color: '#444',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  error: {
    padding: '0.5rem 0.75rem',
    background: '#fee',
    color: '#c00',
    borderRadius: '0.25rem',
    fontSize: '0.875rem',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: '0.875rem',
    fontWeight: 500,
  },
  input: {
    padding: '0.5rem 0.75rem',
    border: '0.0625rem solid #ccc',
    borderRadius: '0.25rem',
    fontSize: '1rem',
  },
  button: {
    padding: '0.6rem 1rem',
    marginTop: '0.25rem',
    background: '#333',
    color: '#fff',
    border: 'none',
    borderRadius: '0.25rem',
    fontSize: '1rem',
    cursor: 'pointer',
  },
  footer: {
    margin: '1rem 0 0',
    fontSize: '0.875rem',
    color: '#666',
    textAlign: 'center',
  },
  link: {
    color: '#333',
    textDecoration: 'underline',
  },
}
