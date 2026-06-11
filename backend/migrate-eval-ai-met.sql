ALTER TABLE candidate_evaluations ADD COLUMN IF NOT EXISTS ai_met boolean;

UPDATE candidate_evaluations
SET ai_met = met
WHERE ai_met IS NULL AND overridden_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_candidate_evals_criterion_override
  ON candidate_evaluations (criterion_id)
  WHERE overridden_by IS NOT NULL;
