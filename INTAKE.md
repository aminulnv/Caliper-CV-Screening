# Caliper CV Screening — Infrastructure intake

**GitLab:** https://gitlab.nextventures.io/qpt/caliper-cv-screening  
**Branch with application code:** `import/caliper-codebase` (merge request pending to `main`)

---

## Application summary

Internal recruiting tool: recruiters upload or import CVs, run AI-assisted screening against job criteria, and optionally discover related LinkedIn profiles.  
Stack: React (Vite) frontend, Fastify API, PostgreSQL (RDS), S3 for CV PDFs.

---

## Ownership

| Role | Name / team | Contact |
|------|-------------|---------|
| **Business owner** | Aleza Hasan — Head of Talent Acquisition, Talent Acquisition, Global HR | aleza.sharmin@nextventures.io |
| **Technical owner** | Api Singha — Manager I, HR Analytics, Global HR | api@nextventures.io |
| **Escalation** | Suhried Datta / platform team | [platform contact] |

---

## Identity & access

| Item | Answer |
|------|--------|
| **Sign-in** | Google Sign-In only (per platform guidance) |
| **Not in scope** | AWS Cognito as long-term auth platform; corporate SAML — *current codebase still uses Cognito as OAuth broker until migrated to direct Google OAuth* |
| **Who can access** | Company email domains only: `nextventures.io`, `wearenext.io`, `fn.com` (configurable via `ALLOWED_EMAIL_DOMAINS`) |
| **Authorization** | Workspace-scoped RBAC: `admin`, `recruiter`, `viewer` |

---

## Volume (estimates — adjust if you have real numbers)

| Metric | Estimate | Notes |
|--------|----------|--------|
| **Active users** | 5–25 recruiters | QPT / internal hiring team |
| **Concurrent users** | 1–5 typical | Low concurrency internal app |
| **CVs screened / month** | 50–500 | Depends on hiring volume |
| **Peak uploads per run** | Up to ~50 CVs per screening run | 10 MB max per PDF |
| **S3 storage growth** | ~1–5 GB / year (order of magnitude) | PDFs; deleted per retention (below) |
| **API traffic** | Low | Internal tool, not public internet-facing |
| **Availability target** | Business hours / best effort | [Confirm with Tech: 99.x% if required] |

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

CVs and candidate records are **confidential HR data** (PII). Treat as **internal / restricted**.

### What is sent to third parties

| Provider | Data shared | Purpose |
|----------|-------------|---------|
| **Anthropic / OpenAI** (optional, workspace-configured) | CV text excerpts, job criteria, prompts | AI scoring & summaries |
| **Recruitee** (optional) | Applicant/job metadata per integration | Job & applicant sync |
| **Exa / Serper / Nubela** (optional) | Search queries derived from candidate context | LinkedIn URL discovery |

Workspace API keys for LLM/ATS providers are **encrypted at rest** (AES-256-GCM, `ENCRYPTION_MASTER_KEY`).

### What we do **not** intend to store long-term

- Raw CV files in S3 beyond configured retention (default **90 days**).
- Screening runs beyond evaluation retention (default **730 days**); runs with recruiter overrides are retained.

---

## PII policy (retention, access, deletion)

| Policy | Implementation |
|--------|----------------|
| **Access control** | JWT auth; all data scoped by `workspace_id`; S3 keys validated per workspace |
| **CV file retention** | Default **90 days**, then S3 object deleted and DB path cleared; configurable per workspace (30 / 90 / 180 / 365 days) |
| **Evaluation retention** | Default **730 days**, then screening run + results deleted; configurable (180 / 365 / 730) or disabled |
| **Automated cleanup** | Scheduled job on backend (`runRetentionCleanup`) |
| **Encryption in transit** | HTTPS for API and frontend; TLS to RDS |
| **Encryption at rest** | RDS and S3 per AWS defaults; API keys encrypted in DB |
| **Right to erasure** | [Confirm process with HR/legal — manual DB/S3 delete or ticket to tech owner] |
| **Logging** | No CV content in production error responses; stack traces suppressed in prod |
| **Training / model improvement** | CV content sent only to configured LLM APIs for scoring; **no** use of candidate data for model training (standard API terms) |

---

## Deployment artifacts (for platform team)

| Item | Location |
|------|----------|
| **Source** | GitLab repo above |
| **Docker** | `backend/Dockerfile`, root `Dockerfile` (frontend), `docker-compose.yml` |
| **Deploy guide** | `DEPLOYMENT.md` |
| **DB migrations** | `backend/migrate.js` + `backend/migrate-*.sql` |

**Runtime dependencies (managed by platform — not a shopping list from dev):** PostgreSQL, S3 bucket, Google OAuth app (post-Cognito migration), secrets for DB/encryption/S3, optional LLM keys.

---

## Notes for Tech

- Please merge `import/caliper-codebase` → `main` when approved.
- Intake reflects **intended** auth: Google only; Cognito removal is planned follow-up work.
- Volume figures are estimates — Aleza Hasan (aleza.sharmin@nextventures.io) or Api Singha (api@nextventures.io) can supply firm numbers if required.
