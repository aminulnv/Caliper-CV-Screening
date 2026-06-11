ALTER TABLE candidate_evaluations
  ADD COLUMN IF NOT EXISTS agreed_by text REFERENCES users(sub),
  ADD COLUMN IF NOT EXISTS agreed_at timestamptz;
