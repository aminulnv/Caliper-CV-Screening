-- Per-job screening model (falls back to workspace default_model when null)
ALTER TABLE job_profiles
  ADD COLUMN IF NOT EXISTS screening_model text;
