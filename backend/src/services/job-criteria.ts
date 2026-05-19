import { sql } from './db.js';

export type CriterionRow = {
  id: string;
  kind: 'must' | 'nice' | 'flag';
  name: string;
  weight: number;
  biased?: boolean;
};

/** Upsert criteria without breaking FKs on past run evaluations. */
export async function syncJobCriteria(jobId: string, criteria: CriterionRow[]): Promise<void> {
  const incomingIds = criteria.map((c) => c.id);

  const referencedRows = await sql<{ criterionId: string }[]>`
    SELECT DISTINCT ce.criterion_id AS "criterionId"
    FROM candidate_evaluations ce
    INNER JOIN run_candidates rc ON rc.id = ce.candidate_id
    INNER JOIN screening_runs sr ON sr.id = rc.run_id
    WHERE sr.job_id = ${jobId}
  `;
  const referencedIds = referencedRows.map((r) => r.criterionId);

  for (const c of criteria) {
    await sql`
      INSERT INTO job_criteria (id, job_id, kind, name, weight, biased, archived)
      VALUES (${c.id}, ${jobId}, ${c.kind}, ${c.name.trim()}, ${c.weight}, ${c.biased ?? false}, false)
      ON CONFLICT (id) DO UPDATE SET
        job_id = EXCLUDED.job_id,
        kind = EXCLUDED.kind,
        name = EXCLUDED.name,
        weight = EXCLUDED.weight,
        biased = EXCLUDED.biased,
        archived = false
    `;
  }

  const referencedNotIncoming = referencedIds.filter((id) => !incomingIds.includes(id));
  if (referencedNotIncoming.length > 0) {
    await sql`
      UPDATE job_criteria SET archived = true
      WHERE job_id = ${jobId} AND id IN ${sql(referencedNotIncoming)}
    `;
  }

  const keepIds = new Set([...incomingIds, ...referencedIds]);
  const existing = await sql<{ id: string }[]>`
    SELECT id FROM job_criteria WHERE job_id = ${jobId}
  `;
  const toDelete = existing.map((r) => r.id).filter((id) => !keepIds.has(id));
  if (toDelete.length > 0) {
    await sql`DELETE FROM job_criteria WHERE job_id = ${jobId} AND id IN ${sql(toDelete)}`;
  }
}

export async function countJobCriteria(jobId: string): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM job_criteria
    WHERE job_id = ${jobId} AND archived = false
  `;
  return row?.count ?? 0;
}
