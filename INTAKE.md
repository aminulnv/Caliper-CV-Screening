# Caliper CV Screening — Infrastructure intake

**GitLab:** https://gitlab.nextventures.io/qpt/caliper-cv-screening  
**Merge request:** https://gitlab.nextventures.io/qpt/caliper-cv-screening/-/merge_requests/1 (`import/caliper-codebase` → `main`)

**Reference standards reviewed:** NEXT Ventures AI Security Standard v1.0 (Dec 2025); platform SSO/security docs (https://sso.fundednext.com/docs)

---

## Application summary

Internal recruiting tool: recruiters upload or import CVs, run AI-assisted screening against job criteria, and optionally discover related LinkedIn profiles.

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite 6 (static build served by nginx) |
| **Backend** | Node.js 20, Fastify 5, TypeScript |
| **Database** | PostgreSQL (RDS) |
| **Object storage** | S3 (CV PDFs only) |
| **Auth** | Google OAuth (company email domain allowlist) |

---

## Ownership

| Role | Name / team | Contact |
|------|-------------|---------|
| **Business owner** | Aleza Hasan — Head of Talent Acquisition, Talent Acquisition, Global HR | aleza.sharmin@nextventures.io |
| **Technical owner** | Api Singha — Manager I, HR Analytics, Global HR | api@nextventures.io |

---

## Volume & sensitivity

| Metric | Estimate | Notes |
|--------|----------|--------|
| **Active users** | 5–25 recruiters | QPT / Global HR hiring |
| **Concurrent users** | 1–5 typical | Low concurrency internal app |
| **CVs screened / month** | 50–500 | Depends on hiring volume |
| **Peak uploads per run** | Up to ~50 CVs per screening run | 10 MB max per PDF |
| **S3 storage growth** | ~1–5 GB / year (order of magnitude) | PDFs; deleted per retention (below) |
| **API traffic** | Low | Internal tool, not public internet-facing |
| **Availability target** | 24/7 (business hours critical; off-hours best effort) |
| **Data sensitivity** | **Restricted / PII** — candidate CVs, names, contact-related fields, screening outcomes |

---

## Architecture & runtime (EKS/ECS-ready)

| Item | Answer |
|------|--------|
| **Containerization** | `backend/Dockerfile` (API), root `Dockerfile` (frontend → nginx). See `DEPLOYMENT.md` and `docker-compose.yml` for local build/run. |
| **Stateless** | **Yes.** API containers hold no local file storage; CV files in S3; sessions via Google ID token (browser); all config via environment variables / Secrets Manager. |
| **Health checks** | `GET /health` on backend; nginx serves frontend on port 80. |
| **Migrations** | One-off job: `node migrate.js` against RDS before/after deploy (see `backend/migrate.js`). |
| **CI** | GitLab CI includes SAST / secret detection (`.gitlab-ci.yml`). |

---

## Identity & access

| Item | Answer |
|------|--------|
| **Sign-in** | **Google OAuth** (Workspace / company accounts) |
| **Corporate IdP** | Google Workspace; optional platform guidance if a different corporate SSO is required later |
| **Who can access** | Company email domains only: `nextventures.io`, `wearenext.io`, `fn.com` (`ALLOWED_EMAIL_DOMAINS`) |
| **Authorization** | Workspace-scoped RBAC: `admin`, `recruiter`, `viewer` — enforced on backend |
| **OAuth origins** | Platform team assigns staging/prod frontend URLs on **organizational Cloudflare**; we add them to Google OAuth authorized JavaScript origins |
| **Attribute mapping** | Verified **email** required on ID token; name optional |

---

## PII & data classification

### What personal data is processed

| Data type | Examples | Where stored | Purpose |
|-----------|----------|--------------|---------|
| **Recruiter identity** | Name, email | PostgreSQL `users` | Auth, audit |
| **Candidate PII** | Name, job title, location, CV text | PostgreSQL `run_candidates`, screening results | Hiring decisions |
| **CV documents** | Full PDF résumés | S3 (`cv_storage_path`) | Parsing & scoring |
| **Professional profiles** | LinkedIn URLs, public profile snippets | PostgreSQL / external search APIs | Related-profile discovery |
| **Audit** | User actions, IP (if logged) | PostgreSQL `audit_log` | Security / compliance |

CVs and candidate records are **confidential HR data (PII)**. Treat as **internal / restricted**.

### Third-party AI / integrations (enterprise keys only in production)

| Provider | Data shared | Purpose |
|----------|-------------|---------|
| **Anthropic / OpenAI** (workspace-configured) | CV excerpts, job criteria, prompts | AI scoring, criteria generation, summaries |
| **Recruitee** (optional) | Applicant/job metadata | Job & applicant sync |
| **Exa / Serper / Nubela** (optional) | Search queries derived from job context | LinkedIn URL discovery |

Workspace API keys are **encrypted at rest** in RDS (AES-256-GCM, `ENCRYPTION_MASTER_KEY`). Production keys supplied via **Secrets Manager** — never in repo.

### Retention (automated)

| Data | Default retention | Mechanism |
|------|-------------------|-----------|
| **CV files (S3)** | 90 days | `runRetentionCleanup` deletes objects and clears DB paths |
| **Screening runs & evaluations** | 730 days | Configurable per workspace; runs with recruiter overrides retained |
| **Configurable** | 30 / 90 / 180 / 365 days (CV); 180 / 365 / 730 (evaluations) | `workspace_settings` |

---

## PII policy (access & deletion)

| Policy | Implementation |
|--------|----------------|
| **Access control** | Google ID token (JWT) + workspace isolation; S3 keys validated per workspace on every upload/download |
| **Encryption in transit** | TLS (HTTPS, RDS TLS) |
| **Encryption at rest** | RDS + S3 per AWS defaults; API keys encrypted in application DB |
| **S3 access** | Private bucket only; no public access (per platform standard) |
| **RDS** | Private subnet; credentials in Secrets Manager only |
| **Right to erasure** | HR/Talent Acquisition requests via business owner → technical owner coordinates deletion of workspace-scoped RDS rows and S3 objects; audit trail retained per policy |
| **Logging** | No CV content in production API error responses; stack traces suppressed in prod |
| **Model training** | No use of candidate data for model training; LLM calls use provider API terms only |

---

## Security & compliance (AI Security Standard alignment)

| Control | Status |
|---------|--------|
| **No secrets in Git** | `.env` gitignored; examples only in `.env.example` |
| **Secrets at runtime** | Expect `DATABASE_URL`, `ENCRYPTION_MASTER_KEY`, `GOOGLE_CLIENT_ID`, S3, LLM keys via **Secrets Manager** / platform pipeline |
| **Input validation** | API validates uploads, criteria, workspace paths; parameterized SQL via postgres.js |
| **Least privilege** | Workspace-scoped data; RBAC on mutating routes |
| **Pre-deploy review** | Subject to platform security review + GitLab SAST/secret detection |
| **Post-deploy** | Quarterly access/logging review per platform cadence (aligned with AI Security Standard §4.4) |

---

## Operational readiness

### Environments & promotion

| Environment | Purpose | Promotion |
|-------------|---------|-----------|
| **dev** | Local / developer (`docker compose`, `npm run dev`) | — |
| **staging** | UAT with anonymized or test data where possible | MR → deploy staging → smoke test |
| **production** | Live HR screening | Approved promotion from staging via platform CI/CD (**dev → staging → production**) |

No direct-to-production deployments. No personal cloud/VPS hosting.

### Logging, monitoring & alerting

| Item | Expectation |
|------|-------------|
| **Application logs** | Fastify structured logs (stdout); suitable for CloudWatch / platform log aggregation |
| **Health** | `GET /health` for liveness/readiness probes |
| **Audit** | User actions recorded in `audit_log` (screening, overrides, criteria changes) |
| **Alerting** | To be configured by platform team (API 5xx, health check failures, RDS/S3 connectivity) |

### Rough cost expectation

| Resource | Sizing (initial) |
|----------|------------------|
| **EKS/ECS** | Small footprint — 2 services (frontend + API), low traffic |
| **RDS** | Small Postgres instance (single workspace, &lt;25 users) |
| **S3** | Low volume (~1–5 GB/year); lifecycle aligned with 90-day CV retention |
| **Google OAuth** | Internal recruiters only (low MAU) |
| **LLM APIs** | Usage-based; optional per workspace (Anthropic/OpenAI) |

**Overall:** low-cost internal tool; scale driven mainly by CV volume and LLM usage.

---

## Deployment artifacts (platform team)

| Item | Location |
|------|----------|
| **Source** | GitLab repo (link above) |
| **Docker** | `backend/Dockerfile`, root `Dockerfile`, `docker-compose.yml` |
| **Deploy guide** | `DEPLOYMENT.md` |
| **DB migrations** | `backend/migrate.js` + `backend/migrate-*.sql` |

**Platform provisions (not supplied by app team):** RDS, private S3, Google OAuth client (or Workspace integration), Secrets Manager entries, IAM roles for workloads, Cloudflare DNS/TLS, CI/CD to EKS/ECS, monitoring/alerting.

---

## Notes for platform team

- Please merge MR !1 when approved so `main` matches application code.
- We will not embed credentials or connection strings in the repository; ready for vault-injected env vars.
- Staging/prod frontend URLs will be added to Google OAuth authorized origins when hostnames are assigned on Cloudflare.
- Volume figures remain estimates — Aleza Hasan or Api Singha can refine with firm hiring forecasts if needed.
