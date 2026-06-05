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
  mustMet?: number;
  nice_met?: number;
  niceMet?: number;
  flag_triggered?: number;
  flagTriggered?: number;
  must_total?: number | null;
  mustTotal?: number | null;
  nice_total?: number | null;
  niceTotal?: number | null;
  flag_total?: number | null;
  flagTotal?: number | null;
  criteria_met_pct?: number | null;
  criteriaMetPct?: number | null;
  must_met_pct?: number | null;
  mustMetPct?: number | null;
  nice_met_pct?: number | null;
  niceMetPct?: number | null;
}): ChecklistCounts | null {
  const mustMet = c.must_met ?? c.mustMet;
  const niceMet = c.nice_met ?? c.niceMet;
  const flagTriggered = c.flag_triggered ?? c.flagTriggered;
  const mustTotal = c.must_total ?? c.mustTotal;
  const niceTotal = c.nice_total ?? c.niceTotal;
  const flagTotal = c.flag_total ?? c.flagTotal;
  const criteriaMetPct = c.criteria_met_pct ?? c.criteriaMetPct;
  const mustMetPct = c.must_met_pct ?? c.mustMetPct;
  const niceMetPct = c.nice_met_pct ?? c.niceMetPct;

  if (mustTotal == null && criteriaMetPct == null) return null;
  const mustTotalVal = mustTotal ?? 0;
  const niceTotalVal = niceTotal ?? 0;
  const flagTotalVal = flagTotal ?? 0;
  return {
    mustMet: mustMet ?? 0,
    mustTotal: mustTotalVal,
    mustPct: mustMetPct ?? pct(mustMet ?? 0, mustTotalVal),
    niceMet: niceMet ?? 0,
    niceTotal: niceTotalVal,
    nicePct: niceMetPct ?? pct(niceMet ?? 0, niceTotalVal),
    flagTriggered: flagTriggered ?? 0,
    flagTotal: flagTotalVal,
    flagPct: pct(flagTriggered ?? 0, flagTotalVal),
    criteriaMet: (mustMet ?? 0) + (niceMet ?? 0),
    criteriaTotal: mustTotalVal + niceTotalVal,
    criteriaMetPct: criteriaMetPct ?? pct((mustMet ?? 0) + (niceMet ?? 0), mustTotalVal + niceTotalVal),
  };
}
