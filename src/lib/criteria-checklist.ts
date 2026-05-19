/** Checklist helpers — binary met (true only) and section percentages. */

export type ChecklistEval = {
  met: boolean | null;
  job_criteria?: { kind?: string; name?: string; weight?: number } | null;
};

export type ChecklistCounts = {
  mustMet: number;
  mustTotal: number;
  mustPct: number | null;
  niceMet: number;
  niceTotal: number;
  nicePct: number | null;
  flagTriggered: number;
  flagTotal: number;
  flagPct: number | null;
  criteriaMet: number;
  criteriaTotal: number;
  criteriaMetPct: number | null;
};

export function isBinaryMet(met: boolean | null | undefined): boolean {
  return met === true;
}

export function pct(met: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((met / total) * 100);
}

export function countsFromEvaluations(evals: ChecklistEval[]): ChecklistCounts {
  const must = evals.filter((e) => e.job_criteria?.kind === 'must');
  const nice = evals.filter((e) => e.job_criteria?.kind === 'nice');
  const flags = evals.filter((e) => e.job_criteria?.kind === 'flag');

  const mustMet = must.filter((e) => isBinaryMet(e.met)).length;
  const niceMet = nice.filter((e) => isBinaryMet(e.met)).length;
  const flagTriggered = flags.filter((e) => isBinaryMet(e.met)).length;

  const criteriaMet = mustMet + niceMet;
  const criteriaTotal = must.length + nice.length;

  return {
    mustMet,
    mustTotal: must.length,
    mustPct: pct(mustMet, must.length),
    niceMet,
    niceTotal: nice.length,
    nicePct: pct(niceMet, nice.length),
    flagTriggered,
    flagTotal: flags.length,
    flagPct: pct(flagTriggered, flags.length),
    criteriaMet,
    criteriaTotal,
    criteriaMetPct: pct(criteriaMet, criteriaTotal),
  };
}

export function countsFromCandidateRow(c: {
  must_met?: number;
  nice_met?: number;
  flag_triggered?: number;
  must_total?: number | null;
  nice_total?: number | null;
  flag_total?: number | null;
  criteria_met_pct?: number | null;
  must_met_pct?: number | null;
  nice_met_pct?: number | null;
}): ChecklistCounts | null {
  if (c.must_total == null && c.criteria_met_pct == null) return null;
  const mustTotal = c.must_total ?? 0;
  const niceTotal = c.nice_total ?? 0;
  const flagTotal = c.flag_total ?? 0;
  return {
    mustMet: c.must_met ?? 0,
    mustTotal,
    mustPct: c.must_met_pct ?? pct(c.must_met ?? 0, mustTotal),
    niceMet: c.nice_met ?? 0,
    niceTotal,
    nicePct: c.nice_met_pct ?? pct(c.nice_met ?? 0, niceTotal),
    flagTriggered: c.flag_triggered ?? 0,
    flagTotal,
    flagPct: pct(c.flag_triggered ?? 0, flagTotal),
    criteriaMet: (c.must_met ?? 0) + (c.nice_met ?? 0),
    criteriaTotal: mustTotal + niceTotal,
    criteriaMetPct: c.criteria_met_pct ?? pct((c.must_met ?? 0) + (c.nice_met ?? 0), mustTotal + niceTotal),
  };
}
