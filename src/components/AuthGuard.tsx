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

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, accessStatus } = useAuth()

  if (loading) {
    return <SessionLoading />
  }

  if (!user) {
    return <Login />
  }

  if (accessStatus === 'loading') {
    return <SessionLoading />
  }

  if (accessStatus === 'denied') {
    return <AccessDenied />
  }

  return <>{children}</>
}
