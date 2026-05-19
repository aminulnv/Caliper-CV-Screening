ALTER TABLE run_candidates ADD COLUMN IF NOT EXISTS score_base int;
ALTER TABLE run_candidates ADD COLUMN IF NOT EXISTS penalty_must int;
ALTER TABLE run_candidates ADD COLUMN IF NOT EXISTS penalty_flag int;
