import { useAuth } from '@/contexts/AuthContext'
import Login from '@/pages/Login'
import AccessDenied from '@/pages/AccessDenied'

function SessionLoading() {
  return (
    <div
      className="access-denied__loading"
      style={{
        display: 'grid',
        placeItems: 'center',
        height: '100vh',
        fontSize: 14,
        color: 'var(--muted, #736d66)',
      }}
    >
      Checking access…
    </div>
  )
}

function SessionUnavailable({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        height: '100vh',
        padding: '1.5rem',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: '24rem' }}>
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', color: 'var(--ink)' }}>
          Cannot reach Caliper backend
        </h2>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.9375rem', color: 'var(--muted)', lineHeight: 1.5 }}>
          Start the API locally with <code>npm run dev:backend</code>, then retry.
        </p>
        <p className="mono muted" style={{ margin: '0 0 1rem', fontSize: '0.75rem' }}>
          {message}
        </p>
        <button
          type="button"
          onClick={onRetry}
          style={{
            padding: '0.625rem 1.25rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            borderRadius: 'var(--radius, 8px)',
            border: '1px solid var(--line)',
            background: 'var(--surface)',
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    </div>
  )
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, accessStatus, sessionError, refreshSession } = useAuth()

  if (loading) {
    return <SessionLoading />
  }

  if (!user) {
    return <Login />
  }

  if (accessStatus === 'loading') {
    return <SessionLoading />
  }

  if (accessStatus === 'unavailable') {
    return (
      <SessionUnavailable
        message={sessionError ?? 'Request failed'}
        onRetry={() => void refreshSession()}
      />
    )
  }

  if (accessStatus === 'denied') {
    return <AccessDenied />
  }

  return <>{children}</>
}
