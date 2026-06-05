import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { googleLogout } from '@react-oauth/google'
import {
  getStoredIdToken,
  parseUserFromToken,
  setIdToken,
  clearIdToken,
  signOutUser,
  type AuthTokenUser,
} from '@/lib/auth'

type AuthContextValue = {
  user: AuthTokenUser | null
  loading: boolean
  displayName: string
  signIn: (idToken: string) => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function loadUserFromStorage(): AuthTokenUser | null {
  const token = getStoredIdToken()
  if (!token) return null
  return parseUserFromToken(token)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthTokenUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setUser(loadUserFromStorage())
    setLoading(false)
  }, [])

  const signIn = useCallback((idToken: string) => {
    setIdToken(idToken)
    setUser(parseUserFromToken(idToken))
  }, [])

  const signOut = useCallback(async () => {
    await signOutUser()
    googleLogout()
    clearIdToken()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, displayName: user?.name ?? '', signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
