import type { User, Session } from '@supabase/supabase-js'

/** Local-only “signed in” user so you can use the app without Supabase. */
export function createDevDummySession(): { user: User; session: Session } {
  const now = new Date().toISOString()
  const user = {
    id: '00000000-0000-4000-8000-000000000001',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'dev@localhost',
    email_confirmed_at: now,
    phone: '',
    confirmed_at: now,
    last_sign_in_at: now,
    app_metadata: {},
    user_metadata: { first_name: 'Local', last_name: 'Dev' },
    identities: [],
    created_at: now,
    updated_at: now,
  } as unknown as User

  const session = {
    access_token: 'dev-dummy-token',
    token_type: 'bearer',
    expires_in: 86_400,
    expires_at: Math.floor(Date.now() / 1000) + 86_400,
    refresh_token: 'dev-dummy-refresh',
    provider_token: null,
    provider_refresh_token: null,
    user,
  } as unknown as Session

  return { user, session }
}
