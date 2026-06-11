import type { RecruiteeApplicant } from '@/services/api';

export type EvalSortMode = 'default' | 'eval_desc' | 'eval_asc';

export function compareApplicantsByEval(
  a: Pick<RecruiteeApplicant, 'evaluation_score'>,
  b: Pick<RecruiteeApplicant, 'evaluation_score'>,
  mode: EvalSortMode,
): number {
  if (mode === 'default') return 0;
  const aScore = a.evaluation_score;
  const bScore = b.evaluation_score;
  const aMissing = aScore == null;
  const bMissing = bScore == null;
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  if (mode === 'eval_desc') return bScore - aScore;
  return aScore - bScore;
}

export function sortApplicantsByEval<T extends Pick<RecruiteeApplicant, 'evaluation_score'>>(
  items: T[],
  mode: EvalSortMode,
): T[] {
  if (mode === 'default') return items;
  return [...items].sort((a, b) => compareApplicantsByEval(a, b, mode));
}
