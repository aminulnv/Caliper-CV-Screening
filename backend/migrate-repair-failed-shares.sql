-- Restore shares that failed to save when the share UI sent an empty recipient list (Jun 2026).
-- Idempotent: ON CONFLICT DO NOTHING.

INSERT INTO run_shares (run_id, user_id, shared_by)
SELECT '13062026-mqchbmis', recipient.sub, sharer.sub
FROM users sharer
JOIN users recipient ON lower(recipient.email) = 'api@nextventures.io'
WHERE sharer.sub = '104928494427966736345'
  AND EXISTS (SELECT 1 FROM screening_runs WHERE id = '13062026-mqchbmis')
ON CONFLICT (run_id, user_id) DO NOTHING;
