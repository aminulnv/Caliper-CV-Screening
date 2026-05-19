ALTER TABLE job_profiles
  ADD COLUMN IF NOT EXISTS applicants_count int;
