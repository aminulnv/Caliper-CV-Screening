import { sql } from './db.js';
import { storage } from './storage.js';

const DEFAULT_CV_RETENTION_DAYS = 90;
const DEFAULT_EVALUATION_RETENTION_DAYS = 730;

const ALLOWED_CV_RETENTION = new Set([30, 90, 180, 365]);
const ALLOWED_EVAL_RETENTION = new Set([180, 365, 730]);

export function normalizeCvRetentionDays(days: number | null | undefined): number {
  if (days != null && ALLOWED_CV_RETENTION.has(days)) return days;
  return DEFAULT_CV_RETENTION_DAYS;
}

/** null = keep evaluation results indefinitely */
export function normalizeEvaluationRetentionDays(days: number | null | undefined): number | null {
  if (days == null) return null;
  if (ALLOWED_EVAL_RETENTION.has(days)) return days;
  return DEFAULT_EVALUATION_RETENTION_DAYS;
}

export type RetentionCleanupStats = {
  workspacesProcessed: number;
  cvFilesDeleted: number;
  runsDeleted: number;
};

type WorkspaceRetention = {
  workspaceId: string;
  cvRetentionDays: number;
  evaluationRetentionDays: number | null;
};

async function loadWorkspacePolicies(): Promise<WorkspaceRetention[]> {
  const rows = await sql`
    SELECT w.id AS workspace_id,
           COALESCE(ws.cv_retention_days, ${DEFAULT_CV_RETENTION_DAYS}) AS cv_retention_days,
           ws.evaluation_retention_days
    FROM workspaces w
    LEFT JOIN workspace_settings ws ON ws.workspace_id = w.id
  `;

  return rows.map((r) => ({
    workspaceId: r.workspaceId as string,
    cvRetentionDays: normalizeCvRetentionDays(r.cvRetentionDays as number),
    evaluationRetentionDays: normalizeEvaluationRetentionDays(
      r.evaluationRetentionDays as number | null,
    ),
  }));
}

async function purgeExpiredCvFiles(
  workspaceId: string,
  retentionDays: number,
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const rows = await sql`
    SELECT rc.id, rc.cv_storage_path
    FROM run_candidates rc
    INNER JOIN screening_runs sr ON sr.id = rc.run_id
    WHERE sr.workspace_id = ${workspaceId}
      AND rc.cv_storage_path IS NOT NULL
      AND rc.created_at < ${cutoff}
  `;

  let deleted = 0;
  for (const row of rows) {
    const path = row.cvStoragePath as string;
    try {
      await storage.remove(path);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[retention] S3 delete failed for ${path}:`, message);
      continue;
    }

    await sql`
      UPDATE run_candidates SET cv_storage_path = NULL WHERE id = ${row.id}
    `;
    deleted++;
  }

  return deleted;
}

async function purgeExpiredRuns(
  workspaceId: string,
  retentionDays: number,
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const runs = await sql`
    SELECT sr.id
    FROM screening_runs sr
    WHERE sr.workspace_id = ${workspaceId}
      AND sr.status IN ('completed', 'failed')
      AND COALESCE(sr.completed_at, sr.created_at) < ${cutoff}
      AND NOT EXISTS (
        SELECT 1
        FROM run_candidates rc
        INNER JOIN candidate_evaluations ce ON ce.candidate_id = rc.id
        WHERE rc.run_id = sr.id AND ce.overridden_by IS NOT NULL
      )
  `;

  if (!runs.length) return 0;

  const runIds = runs.map((r) => r.id as string);
  await sql`DELETE FROM screening_runs WHERE id IN ${sql(runIds)}`;
  return runIds.length;
}

/** Purge expired CV files and screening runs for all workspaces. Safe to run on a schedule. */
export async function runRetentionCleanup(): Promise<RetentionCleanupStats> {
  const stats: RetentionCleanupStats = {
    workspacesProcessed: 0,
    cvFilesDeleted: 0,
    runsDeleted: 0,
  };

  const policies = await loadWorkspacePolicies();

  for (const policy of policies) {
    stats.workspacesProcessed++;

    stats.cvFilesDeleted += await purgeExpiredCvFiles(
      policy.workspaceId,
      policy.cvRetentionDays,
    );

    if (policy.evaluationRetentionDays != null) {
      stats.runsDeleted += await purgeExpiredRuns(
        policy.workspaceId,
        policy.evaluationRetentionDays,
      );
    }
  }

  return stats;
}
