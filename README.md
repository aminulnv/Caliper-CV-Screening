# Caliper CV Screening

React + TypeScript + Vite app: **Supabase Auth** shell (sign in, sign up, protected routes) plus **Caliper** CV screening (runs, jobs, results, workspace settings). Use real Supabase credentials in production, or **dummy auth** in local dev (see below).

Originally scaffolded from [Auth Basement](https://github.com/mr-aminul/Auth-Basement); product UI lives under `src/caliper/`.

## What this is

- **React 18** + **TypeScript** + **Vite**
- **Supabase Auth** (email/password; optional OAuth in the Supabase dashboard)
- **App shell**: sidebar, top bar, responsive layout (mobile drawer, tablet/desktop collapse)
- **Caliper** product UI in `src/caliper/`: screening runs, jobs, results, workspace settings
- **Dummy auth** in dev: set `VITE_DEV_DUMMY_AUTH=1` in `.env` to skip Supabase for local UI (see Troubleshooting)

## Project structure

```
src/
  layout/           # App shell: AppLayout, AppNavBar, ContentHeader, useBreakpoint, AuthenticatedLayout
  config/           # App config (e.g. layout/nav, brand, page titles)
  components/       # Shared UI (e.g. ProtectedRoute)
  contexts/         # React context (AuthContext)
  lib/              # Supabase client, env
  pages/            # Auth routes: Login, SignUp, ForgotPassword, Profile
  caliper/          # Caliper product: data, UI, pages (runs, jobs, results, settings)
  types/            # Shared types (auth)
  App.tsx
  main.tsx
```

## Prerequisites

- **Node 18+**
- A **Supabase project** ([create one](https://supabase.com/dashboard))

## Quick start

1. **Clone or copy** this repo into your project.
2. **Create a Supabase project** (or use an existing one).
3. **Get credentials**: [Dashboard](https://supabase.com/dashboard) → your project → **Project Settings** → **API** → copy **Project URL** and **anon (public) key**.
4. **Env file**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set:
   - `VITE_SUPABASE_URL` = your Project URL  
   - `VITE_SUPABASE_ANON_KEY` = your anon key  
5. **Install and run**:
   ```bash
   npm install
   npm run dev
   ```
6. Open the app, go to **Sign up** / **Sign in** and verify auth works.

## Supabase setup (minimal)

- **Auth** is built-in; no database migrations are required for email/password.
- **Email** provider is enabled by default. Optionally enable Google, GitHub, etc. under **Authentication** → **Providers**.
- For **password reset**, configure a redirect URL in **Authentication** → **URL Configuration** (e.g. your app origin + `/login`) if needed.

## Optional: profiles table

If you want a `public.profiles` table (e.g. `display_name`, `avatar_url`) keyed by `auth.uid()`:

1. In the Supabase dashboard, open **SQL Editor**.
2. Run the migration: `supabase/migrations/00001_profiles.sql`.
3. Optionally add a trigger (see comments in that file) to create a profile row on signup.

Basic auth works without this.

## Using in another app

To reuse only the auth layer in an existing React app:

1. Copy into your app: `src/env.ts`, `src/lib/supabase.ts`, `src/contexts/AuthContext.tsx`, `src/components/ProtectedRoute.tsx`, `src/types/auth.ts`.
2. Optionally copy `src/layout/` for the app shell (sidebar + top bar) and `src/config/layout.ts` for nav/brand config.
3. Ensure your build resolves the `@/` alias (or update imports).
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your env.
5. Wrap your app in `<AuthProvider>` and use `useAuth()` and `<ProtectedRoute>` as needed.

## Scripts

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run preview` — preview production build

## Dummy auth (no Supabase, dev only)

For **Caliper + local UI** without creating a Supabase project yet:

1. In `.env` set **`VITE_DEV_DUMMY_AUTH=1`** (you can omit real `VITE_SUPABASE_*` keys; dev fallbacks are used only so the client module loads).
2. Run `npm run dev` and open the printed URL (usually `http://localhost:5173`). You start signed in as a local **Local Dev** user; **Sign out** returns you to login, where you can use **“Open app without Supabase”** or sign in with any email/password.

`VITE_DEV_DUMMY_AUTH` is ignored in production builds (`npm run build`).

## Troubleshooting

### `npm install` fails with `SELF_SIGNED_CERT_IN_CHAIN`

Your network (often **VPN** or **corporate SSL inspection**) is intercepting HTTPS to the npm registry.

- This repo includes **`.npmrc`** with `strict-ssl=false` **for this folder only** so `npm install` can complete. Remove or edit `.npmrc` when you are on a normal network if you prefer strict TLS.
- **Safer (recommended at work):** install your company root CA and run  
  `npm config set cafile /path/to/your-root-ca.pem`  
  then set `strict-ssl=true` in `.npmrc` or delete `.npmrc`.

### App stuck on “Loading…”

That was usually **invalid placeholder Supabase URLs** plus no timeout. The app now times out and shows login; with **dummy auth** you avoid Supabase entirely for local UI.

### `npm run dev` says `command not found` / missing `vite`

Run **`npm install`** from the project root first (see SSL section above).

## License

Use and adapt as needed for your projects.
