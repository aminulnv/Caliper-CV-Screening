-- Related profiles: LinkedIn-sourced candidates scored for JD alignment (1–5 stars)

create table if not exists related_profile_discoveries (
  id uuid primary key default gen_random_uuid(),
  job_id text references job_profiles(id) on delete cascade not null,
  workspace_id uuid references workspaces(id) on delete cascade not null,
  status text not null default 'queued'
    check (status in ('queued', 'in_progress', 'completed', 'failed')),
  profiles_found int not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_related_profile_discoveries_job
  on related_profile_discoveries(job_id, created_at desc);

create table if not exists related_profiles (
  id uuid primary key default gen_random_uuid(),
  job_id text references job_profiles(id) on delete cascade not null,
  workspace_id uuid references workspaces(id) on delete cascade not null,
  discovery_id uuid references related_profile_discoveries(id) on delete set null,
  name text not null,
  title text,
  company text,
  location text,
  linkedin_url text,
  headline text,
  profile_summary text,
  alignment_stars smallint not null check (alignment_stars between 1 and 5),
  alignment_rationale text,
  source text not null default 'linkedin',
  discovered_at timestamptz default now(),
  created_at timestamptz default now()
);

create unique index if not exists idx_related_profiles_job_linkedin
  on related_profiles(job_id, linkedin_url)
  where linkedin_url is not null;

create index if not exists idx_related_profiles_job_stars
  on related_profiles(job_id, alignment_stars desc, discovered_at desc);
