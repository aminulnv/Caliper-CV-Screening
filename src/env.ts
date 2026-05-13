const rawDummy = import.meta.env.VITE_DEV_DUMMY_AUTH

/** When true, auth skips Supabase and uses a fixed local user (see Login “dummy” button). */
export const isDevDummyAuth =
  import.meta.env.DEV &&
  (rawDummy === '1' || rawDummy === 'true' || rawDummy === 'yes')

const url =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ||
  (isDevDummyAuth ? 'http://127.0.0.1:54321' : undefined)
const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ||
  (isDevDummyAuth ? 'dev-dummy-anon-key-not-sent-to-network' : undefined)

if (import.meta.env.DEV && (!url || !anonKey)) {
  throw new Error(
    'Missing Supabase env. Either set VITE_DEV_DUMMY_AUTH=1 for local UI without Supabase, or copy .env.example to .env and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  )
}

export const env = {
  VITE_SUPABASE_URL: url as string,
  VITE_SUPABASE_ANON_KEY: anonKey as string,
}
