# Deployment

Container images and runtime notes for **Caliper CV Screening** (React/Vite frontend + Fastify API).

## Deployment targets

| Target | Compose file | Purpose |
|--------|--------------|---------|
| **Local dev** | `docker-compose.yml` | Developer machine (`localhost:8080`) |
| **Platform hosted (production)** | `docker-compose.prod.yml` | EC2/VM behind nginx + TLS — **same path for current platform environment and future promotion** |

Platform may label the first RDS/EC2 as “test”; treat it as **production deployment practice**: `NODE_ENV=production`, real RDS/S3/IAM creds, HTTPS domain, migrations before traffic, secrets only on the server, no localhost overrides.

**Current platform host:** `ubuntu@43.205.206.143` (SSH key `okr-ai-app.pem`, VPN required). Instance `i-0995460ae6be07c19`, SG `ec2-rds-5`.

## Architecture

| Service | Image | Port | Role |
|---------|-------|------|------|
| **frontend** | Root `Dockerfile` (nginx) | 80 | Static SPA; Google OAuth in browser |
| **backend** | `backend/Dockerfile` | 3001 | REST API `/api/v1`, health at `/health` |

External dependencies (not in Compose): **PostgreSQL (RDS)**, **S3** for CV PDFs, **Google OAuth client**, optional **Anthropic/OpenAI/Recruitee/Exa** API keys.

## Prerequisites

- Docker 24+ and Docker Compose v2
- Filled env files: `.env` (frontend build) and `backend/.env` (runtime)
- RDS reachable from the host/network where the backend container runs
- IAM or access keys for S3 (if not using instance/task role)
- Google OAuth 2.0 Web client with authorized origins for each frontend URL

Copy examples:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

## Environment variables

### Frontend (build-time — `docker build` / Compose `build.args`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_GOOGLE_CLIENT_ID` | Yes | Google OAuth Web client ID |
| `VITE_API_URL` | Yes (prod) | Public API base URL, e.g. `https://api.example.com` |

These are baked into the static bundle at **build** time. Rebuild the frontend image when the API URL or Google client ID changes.

### Backend (runtime — `backend/.env` or orchestrator secrets)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes* | Full Postgres URL (*or use `DB_HOST` + `DB_USERNAME` + `DB_PASSWORD` + `DB_NAME` below) |
| `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_NAME` / `DB_PASSWORD` | Yes* | Platform-style RDS vars (alternative to `DATABASE_URL`) |
| `ENCRYPTION_MASTER_KEY` | Yes | 64-char hex (32 bytes) |
| `GOOGLE_CLIENT_ID` | Yes | Same as `VITE_GOOGLE_CLIENT_ID` (verifies ID token audience) |
| `S3_BUCKET` | Yes | CV storage bucket |
| `DEFAULT_WORKSPACE_ID` | Yes | UUID for new SSO users |
| `CORS_ORIGIN` | Yes (prod) | Frontend origin, e.g. `https://caliper.example.com` |
| `AWS_REGION` | No | Default `ap-south-1` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | If not using IAM role | S3 access |
| `PORT` | No | Default `3001` |
| `NODE_ENV` | No | Set `production` in deploy |
| `ALLOWED_EMAIL_DOMAINS` | No | Comma-separated allowlist |

See `backend/.env.example` for optional integrations (Recruitee, Exa, retention, etc.).

Generate encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Build images

From the repository root:

```bash
# Backend
docker build -t caliper-backend:latest ./backend

# Frontend (pass Google client ID + API URL for production)
docker build -t caliper-frontend:latest \
  --build-arg VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com \
  --build-arg VITE_API_URL=https://api.your-domain.com \
  -f Dockerfile .
```

## Run with Docker Compose

1. Configure `backend/.env` and root `.env` (Compose reads frontend vars from `.env` for build args).
2. Start API + UI:

```bash
docker compose up --build
```

3. Open **http://localhost:8080** (frontend). API: **http://localhost:3001/health**.

**Sign-in on :8080:** In Google Cloud Console → OAuth client → Authorized JavaScript origins, add:

- `http://localhost:8080`

(Dev with Vite on :5173 uses `http://localhost:5173` — list both.)

### Database migrations

Run once per environment after RDS is available:

```bash
docker compose --profile tools run --rm migrate
```

Or from a machine with `backend/.env`:

```bash
cd backend && npm run migrate
```

**Semantic CV search (Talent Search)** requires the PostgreSQL `vector` extension (pgvector). The app database user usually **cannot** create extensions — enable pgvector once as the RDS master user (or local Postgres superuser), then run migrations.

**One-time enable (superuser):**

```bash
# From repo root, using master credentials (not the app user)
psql "postgresql://MASTER_USER:PASSWORD@your-rds-host:5432/caliper_cv_screening" \
  -f backend/scripts/enable-pgvector.sql
```

Or in `psql`:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

**Then** run app migrations (creates `cv_embeddings` if pgvector is present):

```bash
cd backend && npm run migrate
```

If pgvector is missing, `migrate.js` skips `migrate-cv-embeddings.sql` with a warning instead of failing the whole migration. Embeddings are created asynchronously when new screening runs complete; workspace OpenAI key must be configured in Settings.

**Feature flag (off by default):** set both env vars to `true` when pgvector is ready:

- Backend: `SEMANTIC_CV_SEARCH_ENABLED=true`
- Frontend build: `VITE_SEMANTIC_CV_SEARCH_ENABLED=true`

Until then, the **Talent Search** nav shows a “Coming soon” page and screening runs do not write embeddings.

**Local dev (Homebrew Postgres):**

```bash
brew install pgvector
psql "$DATABASE_URL" -f backend/scripts/enable-pgvector.sql
cd backend && npm run migrate
```

## Platform EC2 deploy (production)

Run on the application server after RDS security group allows EC2 → port 5432.

### 1. Host bootstrap (once)

```bash
ssh -i okr-ai-app.pem ubuntu@43.205.206.143
git clone https://gitlab.nextventures.io/qpt/caliper-cv-screening.git
cd caliper-cv-screening
bash deploy/ec2/bootstrap.sh
# log out/in if docker group was added
```

### 2. Environment (server only — never commit)

```bash
cp deploy/ec2/.env.production.example .env
cp deploy/ec2/backend.env.production.example backend/.env
# Edit both with platform RDS, S3, Google, ENCRYPTION_MASTER_KEY, public URLs
```

Set `VITE_API_URL` and `CORS_ORIGIN` to the **public HTTPS domain** (e.g. `https://caliper.example.com` and `https://caliper.example.com/api` if API is path-mounted — match nginx config).

Add the same HTTPS origin to **Google OAuth** authorized JavaScript origins.

### 3. Migrate, build, run

```bash
docker compose -f docker-compose.prod.yml --profile tools run --rm migrate
docker compose -f docker-compose.prod.yml up -d --build
```

Containers listen on **127.0.0.1:8080** (frontend) and **127.0.0.1:3001** (API) — not exposed publicly.

### 4. nginx + TLS (host)

```bash
sudo cp deploy/nginx/caliper.conf.example /etc/nginx/sites-available/caliper
# edit YOUR_DOMAIN, enable site, then:
sudo certbot --nginx -d YOUR_DOMAIN
sudo nginx -t && sudo systemctl reload nginx
```

### 5. Promote / redeploy later

Same flow for any environment: update image (`git pull`), re-run migrate if schema changed, `docker compose -f docker-compose.prod.yml up -d --build`. Only env URLs and secrets differ between environments.

## GitLab CI / production (outline)

Typical flow for your team’s GitLab + AWS setup:

1. **Build** — CI job builds and pushes `caliper-backend` and `caliper-frontend` to your container registry.
2. **Migrate** — One-off job or init container runs `node migrate.js` against RDS.
3. **Deploy** — ECS/Kubernetes/EC2 runs backend with secrets from Parameter Store/Secrets Manager; frontend behind ALB/CDN on port 80.
4. **Google OAuth** — Add production frontend origin to authorized JavaScript origins.
5. **CORS** — Set `CORS_ORIGIN` to the production frontend URL.

Do not commit `.env` files or tokens. Use GitLab CI variables for build args and runtime secrets.

## Health checks

| Endpoint | Use |
|----------|-----|
| `GET /health` | Backend liveness (returns `{ "status": "ok" }`) |
| `GET /` on frontend container | nginx serving `index.html` |

Images include Docker `HEALTHCHECK` instructions for orchestrators that honor them.

## Troubleshooting

### Docker build: `SELF_SIGNED_CERT_IN_CHAIN` or `npm error Exit handler never called`

Corporate VPN/SSL inspection often breaks `npm` inside Docker. Options:

1. **Preferred:** Add your company root CA and pass it into the build, or set `NODE_EXTRA_CA_CERTS` in the Dockerfile build stage.
2. **Dev-only workaround** (same as README note for local npm):

```bash
docker build --build-arg NPM_STRICT_SSL=false -t caliper-backend:latest ./backend
docker compose build --build-arg NPM_STRICT_SSL=false
```

Do not use `NPM_STRICT_SSL=false` in production CI unless your platform team approves it.

| Issue | Check |
|-------|--------|
| Backend exits on start | Missing/invalid env — see stderr from `validateEnv` |
| Frontend blank / API errors | `VITE_API_URL` at build time must match reachable API URL |
| 401 after login | `GOOGLE_CLIENT_ID` mismatch; email domain not in `ALLOWED_EMAIL_DOMAINS`; token expired |
| Migration fails | `DATABASE_URL`, RDS security group, TLS (`DATABASE_SSL`) |
| CORS errors in browser | `CORS_ORIGIN` must exactly match frontend URL |
