import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { fetchAuthSession, fetchUserAttributes } from 'aws-amplify/auth'
import { signOutUser } from '@/lib/auth'

type AuthUser = { email: string; name: string; sub: string }

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  displayName: string
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAuthSession()
      .then(async (session) => {
        if (!session.tokens?.idToken) { setLoading(false); return; }
        try {
          const attrs = await fetchUserAttributes()
          setUser({
            sub: attrs.sub ?? '',
            email: attrs.email ?? '',
            name: attrs.name ?? attrs.email ?? '',
          })
        } catch {
          const payload = session.tokens.idToken.payload as Record<string, unknown>
          setUser({
            sub: (payload.sub as string) ?? '',
            email: (payload.email as string) ?? '',
            name: (payload.name as string) ?? (payload.email as string) ?? '',
          })
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const signOut = useCallback(async () => {
    await signOutUser()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, displayName: user?.name ?? '', signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
