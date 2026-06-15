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
