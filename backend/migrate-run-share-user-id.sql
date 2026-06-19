-- Repair run_shares.user_id when Google sub migration left stale recipient ids.
-- Safe to re-run: only updates rows where a same-email user exists in the run workspace.
UPDATE run_shares rs
SET user_id = current.sub
FROM screening_runs sr
JOIN users stale ON stale.sub = rs.user_id
JOIN users current ON lower(current.email) = lower(stale.email) AND current.sub <> stale.sub
JOIN user_roles ur ON ur.user_id = current.sub AND ur.workspace_id = sr.workspace_id
WHERE rs.run_id = sr.id
  AND rs.user_id <> current.sub;
