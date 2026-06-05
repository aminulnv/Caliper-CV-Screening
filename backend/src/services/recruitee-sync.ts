import { isPlatformRecruiteeConfigured } from '../config/recruitee.js';
import { sql } from './db.js';
import { writeAuditLogDirect } from '../middleware/audit.js';
import { fetchRecruiteeJobs } from './recruitee.js';
import { getRecruiteeCredentials } from './workspace.js';

export type RecruiteeSyncResult = {
  created: number;
  updated: number;
  closed: number;
  total: number;
};

function recruiteeJobId(recruiteeOfferId: string): string {
  return `REC-${recruiteeOfferId}`;
}

function mapRecruiteeStatus(offerStatus: string | undefined): string {
  if (offerStatus === 'closed' || offerStatus === 'archived') return 'closed';
  return 'open';
}

function defaultDescription(title: string, dept: string | null): string {
  const deptLine = dept ? ` (${dept})` : '';
  return `Synced from Recruitee — ${title}${deptLine}.\n\nEdit the overview to add the full job description and screening criteria.`;
}

async function workspacesWithRecruitee(): Promise<string[]> {
  if (isPlatformRecruiteeConfigured()) {
    const defaultWorkspaceId = process.env.DEFAULT_WORKSPACE_ID?.trim();
    if (defaultWorkspaceId) return [defaultWorkspaceId];
  }

  const rows = await sql`
    SELECT workspace_id FROM workspace_settings
    WHERE recruitee_base_url IS NOT NULL AND recruitee_key_enc IS NOT NULL
  `;
  return rows.map((r) => r.workspaceId as string);
}

/** Import or refresh all active Recruitee offers as Caliper job profiles. */
export async function syncRecruiteeJobs(
  workspaceId: string,
  userId: string | null,
): Promise<RecruiteeSyncResult> {
  const creds = await getRecruiteeCredentials(workspaceId);
  const offers = await fetchRecruiteeJobs(creds.baseUrl, creds.apiKey);
  const activeRefs = new Set(offers.map((o) => o.id));

  const existing = await sql`
    SELECT id, source_ref FROM job_profiles
    WHERE workspace_id = ${workspaceId} AND source = 'recruitee' AND source_ref IS NOT NULL
  `;

  const existingByRef = new Map(
    existing.map((r) => [r.sourceRef as string, r.id as string]),
  );

  let created = 0;
  let updated = 0;

  for (const offer of offers) {
    const jobId = recruiteeJobId(offer.id);
    const status = mapRecruiteeStatus(offer.status);
    const dept = offer.department ?? null;
    const name = offer.title;
    const description =
      offer.description?.trim() || defaultDescription(name, dept);
    const postedOn = offer.posted_on
      ? new Date(offer.posted_on).toISOString().slice(0, 10)
      : null;
    const isNew = !existingByRef.has(offer.id);

    await sql`
      INSERT INTO job_profiles (
        id, workspace_id, name, dept, status, source, source_ref, description,
        posted_on, applicants_count, created_by, updated_at
      )
      VALUES (
        ${jobId}, ${workspaceId}, ${name}, ${dept}, ${status}, 'recruitee', ${offer.id},
        ${description}, ${postedOn}, ${offer.applicants_count ?? 0}, ${userId}, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        dept = COALESCE(EXCLUDED.dept, job_profiles.dept),
        status = EXCLUDED.status,
        source_ref = EXCLUDED.source_ref,
        description = CASE
          WHEN job_profiles.description IS NULL
            OR job_profiles.description LIKE 'Synced from Recruitee%'
          THEN EXCLUDED.description
          ELSE job_profiles.description
        END,
        posted_on = COALESCE(EXCLUDED.posted_on, job_profiles.posted_on),
        applicants_count = EXCLUDED.applicants_count,
        updated_at = NOW()
    `;

    if (isNew) {
      created++;
      await writeAuditLogDirect({
        workspaceId,
        userId,
        action: 'job.imported',
        entityType: 'job',
        entityId: jobId,
        payload: { job_id: jobId, name, source_ref: offer.id },
      });
    } else {
      updated++;
    }
  }

  let closed = 0;
  for (const row of existing) {
    const ref = row.sourceRef as string;
    if (activeRefs.has(ref)) continue;
    await sql`
      UPDATE job_profiles SET status = 'closed', updated_at = NOW()
      WHERE id = ${row.id} AND workspace_id = ${workspaceId}
    `;
    closed++;
  }

  return { created, updated, closed, total: offers.length };
}

export type ScheduledRecruiteeSyncStats = {
  workspacesProcessed: number;
  workspacesFailed: number;
  totalOffers: number;
};

/** Background sync for every workspace with Recruitee configured. */
export async function runScheduledRecruiteeJobSync(): Promise<ScheduledRecruiteeSyncStats> {
  const workspaceIds = await workspacesWithRecruitee();
  let workspacesFailed = 0;
  let totalOffers = 0;

  for (const workspaceId of workspaceIds) {
    try {
      const result = await syncRecruiteeJobs(workspaceId, null);
      totalOffers += result.total;
    } catch {
      workspacesFailed++;
    }
  }

  return {
    workspacesProcessed: workspaceIds.length,
    workspacesFailed,
    totalOffers,
  };
}
