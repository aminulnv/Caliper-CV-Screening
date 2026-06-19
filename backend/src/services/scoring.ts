import type { CandidateStatus, Confidence, Criterion } from '../types/index.js';

export const FLAG_HIT_PENALTY_PER_WEIGHT = 4;

/** Checklist match vs CV substance — recruiters weight both roughly equally. */
const CHECKLIST_WEIGHT = 0.48;
const QUALITY_WEIGHT = 0.52;

const CONFIDENCE_NUMERIC: Record<Confidence, number> = {
  high: 90,
  medium: 70,
  low: 40,
};

export interface CriterionScoringInput {
  criterion_id: string;
  met: boolean | null;
  confidence: string;
}

export interface CvQualityScoreInput {
  overall: number;
  experience?: number | null;
  depth?: number | null;
  presentation?: number | null;
}

export interface ScoreBreakdown {
  base_score: number;
  flag_penalty: number;
  quality_adjustment: number;
  cv_quality_score: number | null;
  score: number;
  must_met: number;
  nice_met: number;
  flag_triggered: number;
  must_total: number;
  nice_total: number;
  flag_total: number;
  must_met_pct: number;
  nice_met_pct: number;
  criteria_met_pct: number;
  confidence: Confidence;
  status: CandidateStatus;
}

/** Binary checklist: only explicit met === true counts as met. */
export function isChecklistMet(result: CriterionScoringInput): boolean {
  return result.met === true;
}

function pctRounded(met: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((met / total) * 100);
}

function normalizeConfidence(value: string): Confidence {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return 'low';
}

function normalizeCvQuality(
  input: CvQualityScoreInput | number | null | undefined,
): CvQualityScoreInput | null {
  if (input == null) return null;
  if (typeof input === 'number') return { overall: input };
  if (input.overall == null || Number.isNaN(input.overall)) return null;
  return input;
}

function buildFullCriterionResults(
  criteria: Criterion[],
  results: CriterionScoringInput[],
): CriterionScoringInput[] {
  const byId = new Map<string, CriterionScoringInput>();
  for (const r of results) {
    if (r.criterion_id) byId.set(r.criterion_id, r);
  }
  return criteria.map((c) => {
    const existing = byId.get(c.id);
    if (existing) return existing;
    return {
      criterion_id: c.id,
      met: false,
      confidence: 'low',
    };
  });
}

export function applyConfidenceThreshold(
  status: CandidateStatus,
  confidence: Confidence,
  threshold?: number,
): CandidateStatus {
  if (threshold == null) return status;
  if (status === 'flagged') return status;
  if (CONFIDENCE_NUMERIC[confidence] < threshold) return 'review';
  return status;
}

function applyQualityCaps(
  score: number,
  quality: CvQualityScoreInput,
): number {
  let capped = score;
  const experience = quality.experience ?? quality.overall;
  const depth = quality.depth ?? quality.overall;

  if (quality.overall < 42) capped = Math.min(capped, 58);
  else if (quality.overall < 52) capped = Math.min(capped, 68);
  if (experience < 38) capped = Math.min(capped, 62);
  else if (experience < 48) capped = Math.min(capped, 72);
  if (depth < 40) capped = Math.min(capped, 65);

  return capped;
}

export function computeScore(
  criteria: Criterion[],
  results: CriterionScoringInput[],
  confidenceThreshold?: number,
  cvQuality?: CvQualityScoreInput | number | null,
): ScoreBreakdown {
  const quality = normalizeCvQuality(cvQuality);
  const fullResults = buildFullCriterionResults(criteria, results);
  const resultFor = (id: string) => fullResults.find((r) => r.criterion_id === id)!;

  const mustCriteria = criteria.filter((c) => c.kind === 'must');
  const niceCriteria = criteria.filter((c) => c.kind === 'nice');
  const flagCriteria = criteria.filter((c) => c.kind === 'flag');

  let mustMet = 0;
  let niceMet = 0;
  let flagTriggered = 0;
  let flagPenalty = 0;
  let lowConfidenceCount = 0;
  const scorableCount = mustCriteria.length + niceCriteria.length;

  for (const criterion of criteria) {
    const result = resultFor(criterion.id);
    if (result.confidence === 'low') lowConfidenceCount++;
    const met = isChecklistMet(result);

    if (criterion.kind === 'flag') {
      if (met) {
        flagTriggered++;
        flagPenalty += criterion.weight * FLAG_HIT_PENALTY_PER_WEIGHT;
      }
      continue;
    }
    if (criterion.kind === 'must' && met) mustMet++;
    if (criterion.kind === 'nice' && met) niceMet++;
  }

  const mustTotal = mustCriteria.length;
  const niceTotal = niceCriteria.length;
  const flagTotal = flagCriteria.length;
  const criteriaMet = mustMet + niceMet;
  const criteriaMetPct = pctRounded(criteriaMet, scorableCount);
  const mustMetPct = pctRounded(mustMet, mustTotal);
  const niceMetPct = pctRounded(niceMet, niceTotal);

  const baseScore = criteriaMetPct;
  let blendedScore = baseScore;
  let qualityAdjustment = 0;

  if (quality) {
    blendedScore = Math.round(
      baseScore * CHECKLIST_WEIGHT + quality.overall * QUALITY_WEIGHT,
    );
    qualityAdjustment = baseScore - blendedScore;
    blendedScore = applyQualityCaps(blendedScore, quality);
  }

  const score = Math.max(0, Math.min(100, blendedScore - flagPenalty));

  const confidence: Confidence =
    lowConfidenceCount > scorableCount / 2 ? 'low' : lowConfidenceCount > 0 ? 'medium' : 'high';

  const experience = quality?.experience ?? quality?.overall;
  const depth = quality?.depth ?? quality?.overall;
  const qualityOkForStrong = quality != null
    && quality.overall >= 68
    && (experience ?? 0) >= 52
    && (depth ?? 0) >= 50;

  let status: CandidateStatus =
    flagTriggered > 0
      ? 'flagged'
      : score >= 80
        && criteriaMetPct >= 80
        && mustTotal > 0
        && mustMet === mustTotal
        && qualityOkForStrong
        ? 'strong'
        : score >= 60
          ? 'promising'
          : 'review';

  status = applyConfidenceThreshold(status, confidence, confidenceThreshold);

  return {
    base_score: baseScore,
    flag_penalty: flagPenalty,
    quality_adjustment: qualityAdjustment,
    cv_quality_score: quality?.overall ?? null,
    score,
    must_met: mustMet,
    nice_met: niceMet,
    flag_triggered: flagTriggered,
    must_total: mustTotal,
    nice_total: niceTotal,
    flag_total: flagTotal,
    must_met_pct: mustMetPct,
    nice_met_pct: niceMetPct,
    criteria_met_pct: criteriaMetPct,
    confidence,
    status,
  };
}

export function confidenceNumeric(confidence: Confidence): number {
  return CONFIDENCE_NUMERIC[confidence];
}

export function mapEvaluationToScoringInput(evalRow: {
  criterion_id: string;
  met: boolean | null;
  confidence: string | null;
  overridden_by: string | null;
}): CriterionScoringInput {
  return {
    criterion_id: evalRow.criterion_id,
    met: evalRow.met,
    confidence: evalRow.overridden_by ? 'high' : normalizeConfidence(evalRow.confidence ?? 'low'),
  };
}
