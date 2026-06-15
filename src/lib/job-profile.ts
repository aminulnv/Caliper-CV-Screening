/** Normalize API/DB job rows (postgres.js camelCase or snake_case) for the UI. */

export function formatJobDate(value: string | Date | null | undefined): string | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Numeric timestamp for sorting; missing/invalid dates sort last. */
export function jobDateSortKey(value: string | Date | null | undefined): number {
  if (value == null || value === '') return -1;
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  return Number.isNaN(t) ? -1 : t;
}

function mapCriteria(criteria: Array<Record<string, unknown>>) {
  return {
    mustHave: criteria
      .filter((c) => c.kind === 'must')
      .map((c) => ({
        id: c.id as string,
        name: c.name as string,
        weight: c.weight as number,
      })),
    niceToHave: criteria
      .filter((c) => c.kind === 'nice')
      .map((c) => ({
        id: c.id as string,
        name: c.name as string,
        weight: c.weight as number,
      })),
    redFlags: criteria
      .filter((c) => c.kind === 'flag')
      .map((c) => ({
        id: c.id as string,
        name: c.name as string,
        weight: c.weight as number,
        biased: Boolean(c.biased),
      })),
  };
}

function mapScreeningRuns(runs: Array<Record<string, unknown>>) {
  return runs.map((r) => ({
    id: r.id as string,
    status: r.status as string,
    cvCount: (r.cvCount ?? r.cv_count ?? 0) as number,
    createdAt: (r.createdAt ?? r.created_at) as string,
    scoreRange: (r.scoreRange ?? r.score_range) as number[] | null,
  }));
}

export function shapeJobRow(j: Record<string, unknown>) {
  const criteria = (j.jobCriteria ?? j.job_criteria ?? []) as Array<Record<string, unknown>>;
  const runs = (j.screeningRuns ?? j.screening_runs ?? []) as Array<Record<string, unknown>>;
  const updatedRaw = j.updatedAt ?? j.updated_at;
  const postedRaw = j.postedOn ?? j.posted_on;
  const sourceRef = (j.sourceRef ?? j.source_ref) as string | null | undefined;
  const id = j.id as string;

  const criteriaLists = mapCriteria(criteria);
  const screeningRuns = mapScreeningRuns(runs);
  const sortedRuns = [...screeningRuns].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return {
    id,
    name: j.name as string,
    dept: (j.dept as string | null) ?? null,
    source: j.source as string,
    sourceRef: sourceRef ?? (id?.startsWith('REC-') ? id.replace(/^REC-/, '') : null),
    status: j.status as string,
    postedOn: formatJobDate(postedRaw as string | Date | null),
    postedOnAt: postedRaw != null && postedRaw !== '' ? String(postedRaw) : null,
    description: (j.description as string) ?? '',
    runsCount: screeningRuns.length,
    lastRun: sortedRuns[0] ? formatJobDate(sortedRuns[0].createdAt) : null,
    lastUpdated: formatJobDate(updatedRaw as string | Date | null),
    screeningModel: (j.screeningModel ?? j.screening_model) as string | null,
    applicantsCount: (j.applicantsCount ?? j.applicants_count) as number | null,
    screeningRuns: sortedRuns,
    ...criteriaLists,
  };
}

export function runsForDisplay(screeningRuns: Array<{
  id: string;
  status: string;
  cvCount: number;
  createdAt: string;
  scoreRange: number[] | null;
}>) {
  return screeningRuns.map((r) => ({
    id: r.id,
    date: formatJobDate(r.createdAt) ?? '—',
    cvs: r.cvCount,
    scoreRange: r.scoreRange,
    status: r.status,
    duration: '—',
    owner: '—',
  }));
}
