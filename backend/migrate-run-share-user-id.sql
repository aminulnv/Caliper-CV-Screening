-- Repair run_shares.user_id when Google sub migration left stale recipient ids.
-- Safe to re-run: only updates rows where a same-email user exists in the run workspace.
UPDATE run_shares
SET user_id = current.sub
FROM screening_runs sr,
     users stale,
     users current,
     user_roles ur
WHERE run_shares.run_id = sr.id
  AND stale.sub = run_shares.user_id
  AND lower(current.email) = lower(stale.email)
  AND current.sub <> stale.sub
  AND ur.user_id = current.sub
  AND ur.workspace_id = sr.workspace_id
  AND run_shares.user_id <> current.sub;
