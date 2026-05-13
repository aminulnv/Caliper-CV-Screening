/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Set to `1` in dev to skip Supabase and use a local dummy session */
  readonly VITE_DEV_DUMMY_AUTH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
