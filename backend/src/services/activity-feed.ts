import { sql } from './db.js';
import { formatAuditEntry } from './audit-format.js';

export async function fetchWorkspaceActivity(
  workspaceId: string,
  currentUserId: string,
  options: { limit: number; scopeToUserId?: string },
) {
  const { limit, scopeToUserId } = options;

  const rows = await sql`
    WITH recent AS (
      SELECT al.*
      FROM audit_log al
      WHERE al.workspace_id = ${workspaceId}
        ${scopeToUserId ? sql`AND al.user_id = ${scopeToUserId}` : sql``}
      ORDER BY al.created_at DESC
      LIMIT ${limit}
    )
    SELECT r.id, r.action, r.payload, r.created_at,
           r.user_id AS user_id,
           u.name AS user_name,
           u.email AS user_email,
           rj.job_id AS job_id,
           jp.name AS job_name
    FROM recent r
    LEFT JOIN users u ON u.sub = r.user_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        CASE WHEN r.entity_type = 'job' THEN r.entity_id END,
        (SELECT sr.job_id FROM screening_runs sr WHERE sr.id = r.entity_id),
        (SELECT sr.job_id FROM run_candidates rc
           JOIN screening_runs sr ON rc.run_id = sr.id
          WHERE rc.id::text = r.entity_id),
        (SELECT sr.job_id FROM candidate_evaluations ce
           JOIN run_candidates rc ON ce.candidate_id = rc.id
           JOIN screening_runs sr ON rc.run_id = sr.id
          WHERE ce.id::text = r.entity_id),
        r.payload->>'job_id'
      ) AS job_id
    ) rj ON true
    LEFT JOIN job_profiles jp ON jp.id = rj.job_id
    ORDER BY r.created_at DESC
  `;

  return rows.map((row) =>
    formatAuditEntry(
      {
        id: row.id as string,
        action: row.action as string,
        payload: row.payload as Record<string, unknown> | string | null,
        userId: row.userId as string | null,
        userName: row.userName as string | null,
        userEmail: row.userEmail as string | null,
        jobId: (row.jobId as string | null) ?? null,
        jobName: (row.jobName as string | null) ?? null,
        createdAt: row.createdAt as Date,
      },
      currentUserId,
    ),
  );
}
