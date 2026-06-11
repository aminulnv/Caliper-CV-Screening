import { sql } from './db.js';

export const CALIBRATION_MIN_SAMPLE = 5;
export const CALIBRATION_MIN_OVERRIDES = 3;
export const CALIBRATION_MIN_OVERRIDE_RATE = 0.35;

export type CriterionCalibrationRow = {
  criterion_id: string;
  criterion_name: string;
  kind: 'must' | 'nice' | 'flag';
  archived: boolean;
  total_evaluations: number;
  override_count: number;
  override_rate: number;
  disagreement_count: number;
  disagreement_rate: number | null;
  recent_notes: string[];
  message: string;
};

export type JobCalibrationResult = {
  job_id: string;
  thresholds: {
    min_sample: number;
    min_overrides: number;
    min_override_rate: number;
  };
  flagged: CriterionCalibrationRow[];
};

function formatOverrideRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function calibrationMessage(
  overrideCount: number,
  totalEvaluations: number,
  overrideRate: number,
): string {
  return `Overridden on ${overrideCount} of ${totalEvaluations} screenings (${formatOverrideRate(overrideRate)}). Consider rewording for clearer CV evidence.`;
}

export async function getJobCalibration(
  jobId: string,
  workspaceId: string,
): Promise<JobCalibrationResult> {
  const rows = await sql`
    SELECT jc.id, jc.name, jc.kind, jc.archived,
           COUNT(ce.id)::int AS total_evaluations,
           COUNT(ce.id) FILTER (WHERE ce.overridden_by IS NOT NULL)::int AS override_count,
           COUNT(ce.id) FILTER (
             WHERE ce.overridden_by IS NOT NULL
               AND ce.ai_met IS NOT NULL
               AND ce.ai_met IS DISTINCT FROM ce.met
           )::int AS disagreement_count
    FROM job_criteria jc
    JOIN candidate_evaluations ce ON ce.criterion_id = jc.id
    JOIN run_candidates rc ON rc.id = ce.candidate_id
    JOIN screening_runs sr ON sr.id = rc.run_id
    WHERE sr.job_id = ${jobId} AND sr.workspace_id = ${workspaceId}
    GROUP BY jc.id
    HAVING COUNT(ce.id) FILTER (WHERE ce.overridden_by IS NOT NULL) >= ${CALIBRATION_MIN_OVERRIDES}
       AND COUNT(ce.id) >= ${CALIBRATION_MIN_SAMPLE}
  `;

  const flagged: CriterionCalibrationRow[] = [];

  for (const row of rows) {
    const totalEvaluations = Number(row.totalEvaluations ?? row.total_evaluations ?? 0);
    const overrideCount = Number(row.overrideCount ?? row.override_count ?? 0);
    const disagreementCount = Number(row.disagreementCount ?? row.disagreement_count ?? 0);
    const overrideRate = totalEvaluations > 0 ? overrideCount / totalEvaluations : 0;

    if (overrideRate < CALIBRATION_MIN_OVERRIDE_RATE) continue;

    const criterionId = row.id as string;
    const noteRows = await sql`
      SELECT ce.override_note
      FROM candidate_evaluations ce
      JOIN run_candidates rc ON rc.id = ce.candidate_id
      JOIN screening_runs sr ON sr.id = rc.run_id
      WHERE ce.criterion_id = ${criterionId}
        AND sr.job_id = ${jobId}
        AND sr.workspace_id = ${workspaceId}
        AND ce.overridden_by IS NOT NULL
        AND ce.override_note IS NOT NULL
        AND trim(ce.override_note) <> ''
      ORDER BY ce.created_at DESC
      LIMIT 3
    `;

    const recentNotes = noteRows
      .map((n) => String(n.overrideNote ?? n.override_note ?? '').trim())
      .filter(Boolean);

    flagged.push({
      criterion_id: criterionId,
      criterion_name: String(row.name ?? ''),
      kind: row.kind as 'must' | 'nice' | 'flag',
      archived: Boolean(row.archived),
      total_evaluations: totalEvaluations,
      override_count: overrideCount,
      override_rate: overrideRate,
      disagreement_count: disagreementCount,
      disagreement_rate: totalEvaluations > 0 ? disagreementCount / totalEvaluations : null,
      recent_notes: recentNotes,
      message: calibrationMessage(overrideCount, totalEvaluations, overrideRate),
    });
  }

  flagged.sort((a, b) => {
    if (b.override_rate !== a.override_rate) return b.override_rate - a.override_rate;
    return b.override_count - a.override_count;
  });

  return {
    job_id: jobId,
    thresholds: {
      min_sample: CALIBRATION_MIN_SAMPLE,
      min_overrides: CALIBRATION_MIN_OVERRIDES,
      min_override_rate: CALIBRATION_MIN_OVERRIDE_RATE,
    },
    flagged,
  };
}
