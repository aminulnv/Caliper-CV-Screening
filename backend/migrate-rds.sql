-- RDS-compatible schema (no Supabase auth.users dependency)

-- Users table (populated by Cognito JWT middleware on first login)
create table if not exists users (
  sub text primary key,
  email text not null unique,
  name text,
  last_seen_at timestamptz default now()
);

-- Workspaces (tenants)
create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- RBAC
create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id text references users(sub) on delete cascade not null,
  workspace_id uuid references workspaces(id) on delete cascade not null,
  role text check (role in ('admin', 'recruiter', 'viewer')) not null,
  created_at timestamptz default now(),
  unique(user_id, workspace_id)
);

-- Per-workspace config
create table if not exists workspace_settings (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  default_model text not null default 'claude-sonnet-4-6',
  allowed_models text[] not null default array['claude-sonnet-4-6'],
  anthropic_key_enc text,
  openai_key_enc text,
  recruitee_base_url text,
  recruitee_key_enc text,
  confidence_threshold int not null default 60,
  cv_retention_days int not null default 90,
  evaluation_retention_days int default 730,
  updated_at timestamptz default now()
);

-- Job profiles
create table if not exists job_profiles (
  id text primary key,
  workspace_id uuid references workspaces(id) on delete cascade not null,
  name text not null,
  dept text,
  status text not null default 'open',
  source text not null default 'manual',
  source_ref text,
  description text,
  posted_on date,
  screening_model text,
  applicants_count int,
  created_by text references users(sub),
  updated_at timestamptz default now()
);

-- Job criteria
create table if not exists job_criteria (
  id text primary key,
  job_id text references job_profiles(id) on delete cascade not null,
  kind text check (kind in ('must', 'nice', 'flag')) not null,
  name text not null,
  weight int not null default 3,
  biased boolean not null default false,
  archived boolean not null default false
);

-- Screening runs
create table if not exists screening_runs (
  id text primary key,
  workspace_id uuid references workspaces(id) on delete cascade not null,
  job_id text references job_profiles(id) not null,
  model_used text,
  status text not null default 'queued'
    check (status in ('queued', 'in_progress', 'completed', 'failed')),
  owner_id text references users(sub) not null,
  cv_count int not null default 0,
  score_range int[],
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- Candidates per run
create table if not exists run_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id text references screening_runs(id) on delete cascade not null,
  name text,
  title text,
  location text,
  score int,
  confidence text check (confidence in ('high', 'medium', 'low')),
  status text check (status in ('strong', 'promising', 'review', 'flagged')),
  summary text,
  parse_warning text,
  must_met int not null default 0,
  nice_met int not null default 0,
  flag_triggered int not null default 0,
  cv_storage_path text,
  recruitee_applicant_id text,
  created_at timestamptz default now()
);

-- Criterion evaluations
create table if not exists candidate_evaluations (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references run_candidates(id) on delete cascade not null,
  criterion_id text references job_criteria(id) not null,
  met boolean,
  confidence text check (confidence in ('high', 'medium', 'low')),
  quote text,
  inferred boolean not null default false,
  notes text,
  overridden_by text references users(sub),
  override_note text,
  created_at timestamptz default now()
);

-- Audit log
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete set null,
  user_id text references users(sub) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  payload jsonb,
  ip text,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_screening_runs_workspace on screening_runs(workspace_id);
create index if not exists idx_screening_runs_job on screening_runs(job_id);
create index if not exists idx_run_candidates_run on run_candidates(run_id);
create index if not exists idx_candidate_evals_candidate on candidate_evaluations(candidate_id);
create index if not exists idx_audit_log_workspace on audit_log(workspace_id);
create index if not exists idx_audit_log_created on audit_log(created_at desc);
create index if not exists idx_user_roles_user on user_roles(user_id);

-- Seed default workspace
insert into workspaces (id, name)
values ('a0000000-0000-0000-0000-000000000001', 'NEXT Ventures')
on conflict (id) do nothing;
