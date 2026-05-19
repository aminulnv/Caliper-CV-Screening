-- Data retention policy columns (run once on existing databases)

alter table workspace_settings
  add column if not exists cv_retention_days int not null default 90,
  add column if not exists evaluation_retention_days int default 730;

comment on column workspace_settings.cv_retention_days is
  'Delete uploaded CV files from S3 after this many days; evaluation rows are kept.';
comment on column workspace_settings.evaluation_retention_days is
  'Delete screening runs (and results) after this many days; NULL = never. Runs with recruiter overrides are always kept.';
