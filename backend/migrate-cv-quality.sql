-- CV quality dimension for human-like scoring (presentation, depth, experience)
ALTER TABLE run_candidates ADD COLUMN IF NOT EXISTS cv_quality_score INTEGER;
ALTER TABLE run_candidates ADD COLUMN IF NOT EXISTS quality_adjustment NUMERIC;
