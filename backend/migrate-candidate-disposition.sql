-- Caliper disposition on screened candidates (Recruitee push is optional)
ALTER TABLE run_candidates ADD COLUMN IF NOT EXISTS disposition TEXT
  CHECK (disposition IS NULL OR disposition IN ('shortlist', 'hold', 'reject', 'advanced'));

ALTER TABLE run_candidates ADD COLUMN IF NOT EXISTS target_stage_id TEXT;
ALTER TABLE run_candidates ADD COLUMN IF NOT EXISTS target_stage_name TEXT;
ALTER TABLE run_candidates ADD COLUMN IF NOT EXISTS disposition_note TEXT;
ALTER TABLE run_candidates ADD COLUMN IF NOT EXISTS disposition_by TEXT REFERENCES users(sub);
ALTER TABLE run_candidates ADD COLUMN IF NOT EXISTS disposition_at TIMESTAMPTZ;
ALTER TABLE run_candidates ADD COLUMN IF NOT EXISTS recruitee_placement_id TEXT;
ALTER TABLE run_candidates ADD COLUMN IF NOT EXISTS recruitee_sync_status TEXT
  CHECK (recruitee_sync_status IS NULL OR recruitee_sync_status IN ('pending', 'synced', 'failed', 'skipped'));
ALTER TABLE run_candidates ADD COLUMN IF NOT EXISTS recruitee_synced_at TIMESTAMPTZ;
ALTER TABLE run_candidates ADD COLUMN IF NOT EXISTS recruitee_sync_error TEXT;

CREATE INDEX IF NOT EXISTS idx_run_candidates_disposition ON run_candidates (run_id, disposition)
  WHERE disposition IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_run_candidates_recruitee_applicant ON run_candidates (recruitee_applicant_id)
  WHERE recruitee_applicant_id IS NOT NULL;

-- Optional job-level default stage for shortlist push
ALTER TABLE job_profiles ADD COLUMN IF NOT EXISTS shortlist_stage_id TEXT;
ALTER TABLE job_profiles ADD COLUMN IF NOT EXISTS shortlist_stage_name TEXT;
