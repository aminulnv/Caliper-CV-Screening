// @ts-nocheck
import { countsFromCandidateRow } from '@/lib/criteria-checklist'
import { matchesPipelineFilter } from '@/lib/candidate-disposition-display'

export const MAX_COMPARE = 4;

export const confOrder = (c) => c === 'high' ? 3 : c === 'medium' ? 2 : 1;

export function candidateMetrics(c) {
  const counts = countsFromCandidateRow(c);
  return {
    mustMet: c.must_met ?? c.mustMet ?? counts?.mustMet ?? 0,
    niceMet: c.nice_met ?? c.niceMet ?? counts?.niceMet ?? 0,
    flagTriggered: c.flag_triggered ?? c.flagTriggered ?? counts?.flagTriggered ?? 0,
    criteriaMetPct: c.criteria_met_pct ?? c.criteriaMetPct ?? counts?.criteriaMetPct ?? null,
    scoreBase: c.score_base ?? c.scoreBase ?? null,
    penaltyFlag: c.penalty_flag ?? c.penaltyFlag ?? 0,
    qualityAdjustment: c.quality_adjustment ?? c.qualityAdjustment ?? 0,
    cvQualityScore: c.cv_quality_score ?? c.cvQualityScore ?? null,
  };
}

export function matchesStatusFilter(candidate, filterStatus) {
  if (filterStatus === 'all') return true;
  if (filterStatus === 'review_flagged') {
    return candidate.status === 'review' || candidate.status === 'flagged';
  }
  return candidate.status === filterStatus;
}

export function matchesDispositionFilter(candidate, filterDisposition) {
  return matchesPipelineFilter(candidate, filterDisposition);
}

/** Live Recruitee state for a run candidate, keyed by its Recruitee applicant id. */
export function recruiteeStateFor(candidate, stateById) {
  const applicantId = candidate?.recruitee_applicant_id ?? candidate?.recruiteeApplicantId ?? null;
  if (!applicantId || !stateById) return null;
  return stateById.get(String(applicantId)) ?? null;
}

export function selectionNeedsRequalify(candidateIds, candidates, stateById) {
  return candidateIds.some((id) => {
    const candidate = candidates.find((c) => c.id === id);
    return candidateShowsDisqualified(candidate, stateById, true);
  });
}

/** True when the candidate is in Recruitee's disqualified pipeline (live state preferred). */
export function candidateShowsDisqualified(candidate, stateById, useRecruiteePipeline = false) {
  const rState = recruiteeStateFor(candidate, stateById);
  if (rState) return Boolean(rState.disqualified);
  if (useRecruiteePipeline && candidate?.disposition === 'reject') return true;
  return false;
}

const STATUS_SORT_ORDER = { strong: 0, promising: 1, review: 2, flagged: 3 };

export function candidateSortValue(candidate, key, stateById, rankById) {
  const metrics = candidateMetrics(candidate);
  switch (key) {
    case 'rank':
      return rankById?.get(candidate.id) ?? 9999;
    case 'score':
      return candidate.score ?? -1;
    case 'candidate':
      return (candidate.name ?? '').toLowerCase();
    case 'pct_met':
      return metrics.criteriaMetPct ?? -1;
    case 'confidence':
      return confOrder(candidate.confidence);
    case 'status':
      return STATUS_SORT_ORDER[candidate.status] ?? 9;
    case 'pipeline': {
      const state = recruiteeStateFor(candidate, stateById);
      if (state?.disqualified) return '\u0000disqualified';
      return (state?.stageName ?? candidate.target_stage_name ?? 'zzz').toLowerCase();
    }
    default:
      return 0;
  }
}

export function sortCandidates(list, sortState, stateById, rankById) {
  if (!sortState) return list;
  const mult = sortState.dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const va = candidateSortValue(a, sortState.key, stateById, rankById);
    const vb = candidateSortValue(b, sortState.key, stateById, rankById);
    if (typeof va === 'string' && typeof vb === 'string') {
      return mult * va.localeCompare(vb);
    }
    return mult * (Number(va) - Number(vb));
  });
}

export function cycleTableSort(prev, key) {
  if (prev?.key !== key) return { key, dir: 'desc' };
  if (prev.dir === 'desc') return { key, dir: 'asc' };
  return null;
}

export const DISPOSITION_LABELS = {
  shortlist: 'Shortlist',
  hold: 'Hold',
  reject: 'Reject',
  advanced: 'Move to stage',
};

export function dispositionSuccessLabel(
  body,
  candidateName,
  useRecruiteePipeline,
) {
  const who = candidateName ?? 'Candidate';
  if (body.requalify && body.target_stage_name) {
    return `${who} re-qualified to ${body.target_stage_name}.`;
  }
  if (body.target_stage_name) {
    return `${who} moved to ${body.target_stage_name}.`;
  }
  if (body.disposition === 'reject') {
    return `${who} marked as ${useRecruiteePipeline ? 'disqualified' : 'rejected'}.`;
  }
  const label = DISPOSITION_LABELS[body.disposition] ?? body.disposition;
  return `${who} marked as ${label}.`;
}

export function patchCandidatesDisposition(candidates, candidateIds, body) {
  return (candidates ?? []).map((c) => {
    if (!candidateIds.includes(c.id)) return c;
    const next = { ...c, disposition: body.disposition };
    if (body.target_stage_id != null) {
      next.target_stage_id = body.target_stage_id;
      next.target_stage_name = body.target_stage_name ?? null;
    }
    if (body.disposition === 'reject') {
      next.recruitee_disqualified = true;
    } else if (body.requalify) {
      next.recruitee_disqualified = false;
    }
    return next;
  });
}
