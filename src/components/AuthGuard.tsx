import { useAuth } from '@/contexts/AuthContext'
import Login from '@/pages/Login'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', fontSize: 14, color: '#6b7280' }}>
        Loading…
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  return <>{children}</>
}
