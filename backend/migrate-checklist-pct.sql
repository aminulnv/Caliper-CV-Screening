ALTER TABLE run_candidates ADD COLUMN IF NOT EXISTS must_total int;
ALTER TABLE run_candidates ADD COLUMN IF NOT EXISTS nice_total int;
ALTER TABLE run_candidates ADD COLUMN IF NOT EXISTS flag_total int;
ALTER TABLE run_candidates ADD COLUMN IF NOT EXISTS criteria_met_pct int;
ALTER TABLE run_candidates ADD COLUMN IF NOT EXISTS must_met_pct int;
ALTER TABLE run_candidates ADD COLUMN IF NOT EXISTS nice_met_pct int;
