import { sql } from '../services/db.js';

/**
 * Runs are private to their owner unless explicitly shared (run_shares).
 * Use in JOIN/WHERE on screening_runs aliased as `sr`.
 */
export function screeningRunAccessible(userId: string) {
  return sql`
    (
      sr.owner_id = ${userId}
      OR EXISTS (
        SELECT 1 FROM run_shares rs
        WHERE rs.run_id = sr.id AND rs.user_id = ${userId}
      )
    )
  `;
}

/**
 * List/detail visibility: own runs in the active workspace, or any run shared with this user
 * (even if their session workspace differs — shares are explicit grants).
 * Use in WHERE on screening_runs aliased as `sr`.
 */
export function runVisibleToUser(workspaceId: string, userId: string) {
  return sql`
    (
      (sr.workspace_id = ${workspaceId} AND sr.owner_id = ${userId})
      OR EXISTS (
        SELECT 1 FROM run_shares rs_visible
        WHERE rs_visible.run_id = sr.id AND rs_visible.user_id = ${userId}
      )
    )
  `;
}
