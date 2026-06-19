-- Per-member AI budget caps (null = unlimited; viewers typically null)
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS ai_budget_usd NUMERIC(10,2);

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  user_id      TEXT NOT NULL REFERENCES users(sub),
  feature      TEXT NOT NULL,
  model        TEXT NOT NULL,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  cost_usd     NUMERIC(10,6) NOT NULL,
  run_id       TEXT REFERENCES screening_runs(id),
  job_id       TEXT REFERENCES job_profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage_events (workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_run ON ai_usage_events (run_id) WHERE run_id IS NOT NULL;
