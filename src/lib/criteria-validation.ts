/** Client-side rubric validation — keep in sync with backend/src/services/criteria-validation.ts */

export const BIAS_WARNING_PATTERNS =
  /tenure|employment gap|career gap|\bgap\b|short[- ]?term|non[- ]linear|career break|\byoung\b|\bold\b|years?\s+old|over\s+\d+\s+years?\s+old|under\s+\d+/i;

export const PROTECTED_ATTRIBUTE_PATTERNS =
  /\b(age|aged|gender|male|female|non[- ]?binary|pregnant|pregnancy|race|racial|religion|religious|nationality|citizenship|ethnic|ethnicity|disabilit|marital|married|single|children|childcare|sexual orientation|lgbtq?)\b/i;

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
