CREATE TABLE IF NOT EXISTS cv_embeddings (
  candidate_id uuid PRIMARY KEY REFERENCES run_candidates(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  embedding vector(1536) NOT NULL,
  content_hash text NOT NULL,
  model text NOT NULL DEFAULT 'text-embedding-3-small',
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('pending', 'ready', 'failed')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cv_embeddings_workspace ON cv_embeddings (workspace_id);
