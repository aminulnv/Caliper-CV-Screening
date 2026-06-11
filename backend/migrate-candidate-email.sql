ALTER TABLE run_candidates ADD COLUMN IF NOT EXISTS applicant_email text;

CREATE INDEX IF NOT EXISTS idx_run_candidates_email
  ON run_candidates (lower(applicant_email))
  WHERE applicant_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_run_candidates_recruitee_id
  ON run_candidates (recruitee_applicant_id)
  WHERE recruitee_applicant_id IS NOT NULL;
