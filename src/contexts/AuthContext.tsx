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
import { api, type UserRole } from '@/services/api'
import { canEditWorkspace, isWorkspaceAdmin } from '@/lib/roles'

export type AccessStatus = 'loading' | 'active' | 'denied'

type AuthContextValue = {
  user: AuthTokenUser | null
  loading: boolean
  accessStatus: AccessStatus
  role: UserRole | null
  workspace: { id: string; name: string } | null
  canEdit: boolean
  isAdmin: boolean
  displayName: string
  signIn: (idToken: string) => void
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
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
  const [accessStatus, setAccessStatus] = useState<AccessStatus>('loading')
  const [role, setRole] = useState<UserRole | null>(null)
  const [workspace, setWorkspace] = useState<{ id: string; name: string } | null>(null)

  const refreshSession = useCallback(async () => {
    const token = getStoredIdToken()
    if (!token) {
      setAccessStatus('loading')
      setRole(null)
      setWorkspace(null)
      return
    }

    setAccessStatus('loading')
    try {
      const me = await api.me.get()
      if (me.access === 'none') {
        setAccessStatus('denied')
        setRole(null)
        setWorkspace(null)
      } else {
        setAccessStatus('active')
        setRole(me.role)
        setWorkspace(me.workspace)
        setUser((prev) => ({
          sub: me.user.sub,
          email: me.user.email,
          name: me.user.name ?? prev?.name ?? me.user.email,
        }))
      }
    } catch {
      setAccessStatus('denied')
      setRole(null)
      setWorkspace(null)
    }
  }, [])

  useEffect(() => {
    const stored = loadUserFromStorage()
    setUser(stored)
    setLoading(false)
    if (stored) {
      void refreshSession()
    } else {
      setAccessStatus('loading')
    }
  }, [refreshSession])

  const signIn = useCallback((idToken: string) => {
    setIdToken(idToken)
    setUser(parseUserFromToken(idToken))
    void refreshSession()
  }, [refreshSession])

  const signOut = useCallback(async () => {
    await signOutUser()
    googleLogout()
    clearIdToken()
    setUser(null)
    setRole(null)
    setWorkspace(null)
    setAccessStatus('loading')
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        accessStatus,
        role,
        workspace,
        canEdit: canEditWorkspace(role),
        isAdmin: isWorkspaceAdmin(role),
        displayName: user?.name ?? '',
        signIn,
        signOut,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
