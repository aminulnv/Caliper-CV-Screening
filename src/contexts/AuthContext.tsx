import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { isDevDummyAuth } from '@/env'
import { createDevDummySession } from '@/lib/devDummyAuth'

/** Display name: user_metadata first_name (+ last_name), else email prefix */
export function getDisplayName(user: User | null): string {
  if (!user) return ''
  const meta = user.user_metadata as Record<string, unknown> | undefined
  const first = typeof meta?.first_name === 'string' ? meta.first_name.trim() : ''
  const last = typeof meta?.last_name === 'string' ? (meta.last_name as string).trim() : ''
  const name = [first, last].filter(Boolean).join(' ')
  if (name) return name
  const prefix = user.email?.split('@')[0]
  return prefix ?? ''
}

type AuthContextValue = {
  user: User | null
  session: Session | null
  loading: boolean
  /** True when `VITE_DEV_DUMMY_AUTH=1` — no Supabase calls for session */
  isDummyAuth: boolean
  /** DEV dummy only: sign in as a fixed local user without Supabase */
  enterDevDummySession: () => void
  displayName: string
  signUp: (
    params: { email: string; password: string },
    options?: { data?: Record<string, unknown> }
  ) => Promise<{ error: Error | null }>
  signInWithPassword: (params: {
    email: string
    password: string
  }) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  resetPasswordForEmail: (email: string) => Promise<{ error: Error | null }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** If Supabase never answers (bad URL, DNS, firewall), unblock the UI after this long. */
const AUTH_SESSION_TIMEOUT_MS = 10_000

function getAuthBootstrap(): {
  user: User | null
  session: Session | null
  loading: boolean
} {
  if (isDevDummyAuth) {
    const { user, session } = createDevDummySession()
    return { user, session, loading: false }
  }
  return { user: null, session: null, loading: true }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const boot = getAuthBootstrap()
  const [user, setUser] = useState<User | null>(boot.user)
  const [session, setSession] = useState<Session | null>(boot.session)
  const [loading, setLoading] = useState(boot.loading)

  const enterDevDummySession = useCallback(() => {
    if (!isDevDummyAuth) return
    const { user: u, session: s } = createDevDummySession()
    setUser(u)
    setSession(s)
  }, [])

  useEffect(() => {
    if (isDevDummyAuth) {
      return
    }

    let cancelled = false
    let timedOut = false

    const timer = window.setTimeout(() => {
      timedOut = true
      if (cancelled) return
      setLoading(false)
      if (import.meta.env.DEV) {
        console.warn(
          '[Auth] getSession() is still pending after',
          AUTH_SESSION_TIMEOUT_MS,
          'ms — showing UI without a session. Use a real VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env (the template placeholders often hang or never resolve).',
        )
      }
    }, AUTH_SESSION_TIMEOUT_MS)

    supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        if (cancelled) return
        window.clearTimeout(timer)
        setSession(s)
        setUser(s?.user ?? null)
        setLoading(false)
        if (timedOut && import.meta.env.DEV && s) {
          console.info('[Auth] Session arrived after the UI timeout; you are now signed in.')
        }
      })
      .catch((err) => {
        if (cancelled) return
        window.clearTimeout(timer)
        if (import.meta.env.DEV) {
          console.warn('[Auth] getSession() failed:', err)
        }
        setSession(null)
        setUser(null)
        setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setUser(s?.user ?? null)
    })

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      subscription.unsubscribe()
    }
  }, [])

  const signUp = useCallback(
    async (
      params: { email: string; password: string },
      options?: { data?: Record<string, unknown> }
    ) => {
      if (isDevDummyAuth) {
        return {
          error: new Error('Sign up is disabled while VITE_DEV_DUMMY_AUTH is set.'),
        }
      }
      const { error } = await supabase.auth.signUp({
        ...params,
        options: options ? { data: options.data } : undefined,
      })
      return { error: error ?? null }
    },
    []
  )

  const signInWithPassword = useCallback(
    async (params: { email: string; password: string }) => {
      if (isDevDummyAuth) {
        enterDevDummySession()
        return { error: null }
      }
      const { error } = await supabase.auth.signInWithPassword(params)
      return { error: error ?? null }
    },
    [enterDevDummySession]
  )

  const signOut = useCallback(async () => {
    if (isDevDummyAuth) {
      setUser(null)
      setSession(null)
      return
    }
    await supabase.auth.signOut()
  }, [])

  const resetPasswordForEmail = useCallback(async (_email: string) => {
    if (isDevDummyAuth) {
      return {
        error: new Error('Password reset is disabled while VITE_DEV_DUMMY_AUTH is set.'),
      }
    }
    const { error } = await supabase.auth.resetPasswordForEmail(_email, {
      redirectTo: `${window.location.origin}/login`,
    })
    return { error: error ?? null }
  }, [])

  const displayName = getDisplayName(user)

  const value: AuthContextValue = {
    user,
    session,
    loading,
    isDummyAuth: isDevDummyAuth,
    enterDevDummySession,
    displayName,
    signUp,
    signInWithPassword,
    signOut,
    resetPasswordForEmail,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (ctx == null) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
