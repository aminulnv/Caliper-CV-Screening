# Caliper CV Screening

AI-assisted CV screening for recruiters: upload or pull CVs, score candidates against job criteria, and discover related LinkedIn profiles. The app is a **React + Vite** frontend with a **Fastify** backend on **AWS** (Google OAuth, RDS Postgres, S3).

## Architecture

| Layer | Stack |
|-------|--------|
| Frontend | React 18, TypeScript, Vite, Google OAuth (`@react-oauth/google`) |
| Backend | Fastify on Node 18+, JWT validation via Google JWKS |
| Database | PostgreSQL on AWS RDS |
| Storage | S3 for uploaded CV PDFs (`{workspaceId}/…` keys) |
| Auth | Google OAuth (company email domain allowlist) |

```
Browser (5173)  →  Google (sign-in)  →  ID token
       ↓
Fastify API (3001)  →  RDS Postgres
                   →  S3 (CV files)
                   →  Anthropic / OpenAI (scoring)
                   →  Recruitee, Exa, Nubela (optional integrations)
```

## Project structure

```
src/                    # Frontend (Vite)
  caliper/              # Product UI: runs, jobs, profiles, settings
  lib/auth.ts           # Google ID token storage
  contexts/AuthContext.tsx
backend/
  src/
    server.ts           # Fastify entry
    config/env.ts       # Required env validation at startup
    middleware/auth.ts    # Google JWT + workspace provisioning
    routes/             # REST API (/api/v1/…)
  migrate.js            # RDS schema migrations
  migrate-*.sql
```

## Prerequisites

- **Node 18+**
- **AWS**: RDS Postgres, S3 bucket
- **Google Cloud**: OAuth 2.0 Web client ID
- Optional: Recruitee API key, Exa/Serper/Nubela keys for related profiles

## Quick start (local)

### 1. Frontend env

```bash
cp .env.example .env
```

Set in `.env`:

- `VITE_GOOGLE_CLIENT_ID`
- `VITE_API_URL=http://localhost:3001` (default if omitted)

### 2. Backend env

```bash
cp backend/.env.example backend/.env
```

Required variables (validated at startup — the server exits if any are missing or invalid):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | RDS Postgres connection string |
| `ENCRYPTION_MASTER_KEY` | 64-char hex key for workspace API key encryption |
| `GOOGLE_CLIENT_ID` | Same value as `VITE_GOOGLE_CLIENT_ID` (verifies token audience) |
| `S3_BUCKET` | CV storage bucket |
| `DEFAULT_WORKSPACE_ID` | Workspace UUID for new SSO users (role: **recruiter**) |

In production, `CORS_ORIGIN` is also required.

Generate an encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Database migrations

From `backend/` (with `DATABASE_URL` set):

```bash
npm install
npm run migrate
```

Migrations run all `migrate-*.sql` files in order and **exit non-zero** on failure.

RDS requires TLS; it is enabled automatically when the host contains `rds.amazonaws.com`. For local Postgres without TLS, set `DATABASE_SSL=false`.

### 4. Run

Terminal 1 — backend:

```bash
cd backend && npm run dev
```

Terminal 2 — frontend:

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Sign in with Google. The backend validates the JWT, upserts the user, and assigns the default workspace if needed.

Health check: `GET http://localhost:3001/health`

## Google OAuth setup

1. In [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials, create an **OAuth 2.0 Client ID** (Web application).
2. **Authorized JavaScript origins:** `http://localhost:5173`, `http://localhost:8080`, and your production frontend URL.
3. Copy the client ID into `.env` (`VITE_GOOGLE_CLIENT_ID`) and `backend/.env` (`GOOGLE_CLIENT_ID`).
4. Set `ALLOWED_EMAIL_DOMAINS` in backend `.env` (comma-separated, e.g. `nextventures.io`).

New users without a row in `user_roles` are auto-provisioned into `DEFAULT_WORKSPACE_ID` as **recruiter**, not admin.

## AWS resources

- **RDS**: Run `backend/migrate.js` once per environment after creating the database.
- **S3**: Bucket policy should restrict access to the backend IAM role; object keys are scoped per workspace.
- **Google OAuth**: Restrict the OAuth consent screen to your Workspace org if required by security policy.

## Scripts

| Command | Where | Description |
|---------|-------|-------------|
| `npm run dev` | root | Vite dev server |
| `npm run build` | root | Production frontend build |
| `npm run dev:backend` | root | Backend watch mode |
| `npm run migrate` | root | Run RDS migrations |
| `npm run dev` | backend | Fastify with tsx watch |
| `npm run migrate` | backend | Run RDS migrations |
| `npm run build` | backend | Compile TypeScript |
| `npm start` | backend | Run compiled server |

## Docker deployment

Container images and production deploy steps are documented in **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

Quick start:

```bash
cp .env.example .env && cp backend/.env.example backend/.env
# Edit both files, then:
docker compose up --build
```

Frontend: http://localhost:8080 · API health: http://localhost:3001/health

## Security notes

- CV storage paths are validated on upload, parse, run creation, and download — clients cannot access another workspace's S3 keys.
- API keys (Recruitee, LLM providers) are encrypted at rest with `ENCRYPTION_MASTER_KEY`.
- Stack traces are not returned in production error responses.

## Troubleshooting

### `npm install` fails with `SELF_SIGNED_CERT_IN_CHAIN`

Corporate VPN or SSL inspection may intercept npm (`SELF_SIGNED_CERT_IN_CHAIN`). Prefer installing your company root CA and using `npm config set cafile /path/to/ca.pem` instead of disabling TLS verification.

### Backend exits immediately on start

Check stderr for missing env vars from `backend/src/config/env.ts`. All required keys must be set in `backend/.env`.

### Migration failed

Fix the reported SQL error and re-run `npm run migrate` from `backend/`. Partial failures leave `failed` exit code 1.

### Sign-in works but API returns 403

- Email domain not in `ALLOWED_EMAIL_DOMAINS`
- ID token missing verified email claim
- `DEFAULT_WORKSPACE_ID` not set or invalid UUID

## License

Use and adapt as needed for your projects.
