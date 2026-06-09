-- Access management: invites + seat limits (idempotent for existing RDS)

alter table workspaces add column if not exists max_seats int not null default 25;

create table if not exists workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade not null,
  email text not null,
  role text check (role in ('admin', 'recruiter', 'viewer')) not null,
  invited_by text references users(sub) not null,
  created_at timestamptz default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  unique (workspace_id, email)
);

create index if not exists idx_workspace_invites_email on workspace_invites(lower(email));
create index if not exists idx_workspace_invites_workspace on workspace_invites(workspace_id);
