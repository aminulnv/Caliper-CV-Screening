/** Shared rubric validation for API boundaries. */

export const BIAS_WARNING_PATTERNS =
  /tenure|employment gap|career gap|\bgap\b|short[- ]?term|non[- ]linear|career break|\byoung\b|\bold\b|years?\s+old|over\s+\d+\s+years?\s+old|under\s+\d+/i;

export const PROTECTED_ATTRIBUTE_PATTERNS =
  /\b(age|aged|gender|male|female|non[- ]?binary|pregnant|pregnancy|race|racial|religion|religious|nationality|citizenship|ethnic|ethnicity|disabilit|marital|married|single|children|childcare|sexual orientation|lgbtq?)\b/i;

export type CriterionInput = {
  name: string;
  kind: 'must' | 'nice' | 'flag';
  weight: number;
  biased?: boolean;
};

export function getBiasWarning(name: string): boolean {
  return BIAS_WARNING_PATTERNS.test(name.trim());
}

export function getProtectedAttributeError(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Criterion text cannot be empty';
  if (PROTECTED_ATTRIBUTE_PATTERNS.test(trimmed)) {
    return 'This criterion may relate to a protected characteristic and cannot be used. Rephrase to focus on job-relevant skills or experience.';
  }
  return null;
}

export function validateCriteriaPayload(
  criteria: CriterionInput[],
): { ok: true } | { ok: false; error: string } {
  if (criteria.length === 0) {
    return { ok: false, error: 'At least one criterion is required before saving a rubric' };
  }
  for (const c of criteria) {
    const protectedErr = getProtectedAttributeError(c.name);
    if (protectedErr) {
      return { ok: false, error: protectedErr };
    }
    if (!c.name.trim()) {
      return { ok: false, error: 'Criterion text cannot be empty' };
    }
    if (c.weight < 1 || c.weight > 5) {
      return { ok: false, error: 'Criterion weight must be between 1 and 5' };
    }
  }
  return { ok: true };
}
