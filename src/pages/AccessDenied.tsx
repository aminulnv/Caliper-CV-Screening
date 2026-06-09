import type { CSSProperties } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { assets, getBackgroundStyle } from '@/config/assets'

export default function AccessDenied() {
  const { user, signOut } = useAuth()

  return (
    <div className="access-denied" style={styles.wrapper}>
      <div className="access-denied__hero" style={styles.heroPanel}>
        <div className="access-denied__orb access-denied__orb--1" aria-hidden />
        <div className="access-denied__orb access-denied__orb--2" aria-hidden />
        <img src={assets.logoUrl} alt="" width={48} height={48} style={styles.brandLogo} aria-hidden />
        <h1 className="access-denied__brand" style={styles.brandTitle}>Caliper</h1>
        <p style={styles.heroSubtitle}>CV screening for hiring teams</p>
      </div>

      <div className="access-denied__panel" style={styles.contentPanel}>
        <div className="access-denied__card access-denied__card--animate" style={styles.card}>
          <div className="access-denied__lock" aria-hidden>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
            </svg>
          </div>

          <h2 style={styles.title}>Access not granted</h2>
          <p style={styles.message}>
            Unfortunately, you are not invited to Caliper. Please contact your Admin.
          </p>
          {user?.email && (
            <p className="mono muted" style={styles.email}>
              Signed in as {user.email}
            </p>
          )}

          <button type="button" className="access-denied__signout" style={styles.signOutBtn} onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrapper: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    overflow: 'hidden',
    background: 'var(--bg, #f3f2ef)',
    padding: '1rem',
    boxSizing: 'border-box',
  },
  heroPanel: {
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
    position: 'relative',
  },
  brandLogo: {
    width: 48,
    height: 48,
    marginBottom: '1rem',
    borderRadius: '12px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
    position: 'relative',
    zIndex: 1,
  },
  brandTitle: {
    margin: 0,
    fontSize: '3.5rem',
    fontWeight: 700,
    color: '#fff',
    lineHeight: 1.1,
    position: 'relative',
    zIndex: 1,
  },
  heroSubtitle: {
    margin: 0,
    maxWidth: '28rem',
    fontSize: '1.05rem',
    fontWeight: 400,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 1.4,
    position: 'relative',
    zIndex: 1,
  },
  contentPanel: {
    flex: 3,
    minWidth: 0,
    minHeight: 0,
    padding: '2.5rem 2rem',
    background: 'var(--surface, #fff)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    overflow: 'auto',
    borderRadius: 'var(--radius-xl, 16px)',
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    border: '1px solid var(--line, #ddd8d1)',
    borderLeft: 'none',
    boxShadow: 'var(--shadow-2)',
  },
  card: {
    maxWidth: '22rem',
    margin: '0 auto',
    width: '100%',
    textAlign: 'center',
  },
  title: {
    margin: '0 0 0.75rem',
    fontSize: '1.5rem',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    color: 'var(--ink, #181614)',
  },
  message: {
    margin: '0 0 1rem',
    fontSize: '0.9375rem',
    lineHeight: 1.55,
    color: 'var(--muted, #736d66)',
  },
  email: {
    margin: '0 0 1.5rem',
    fontSize: '0.75rem',
  },
  signOutBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.625rem 1.25rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    borderRadius: 'var(--radius, 8px)',
    border: '1px solid var(--line, #ddd8d1)',
    background: 'var(--surface, #fff)',
    color: 'var(--ink, #181614)',
    cursor: 'pointer',
    boxShadow: 'var(--shadow-1)',
  },
}
