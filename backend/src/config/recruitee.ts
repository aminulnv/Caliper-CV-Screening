/**
 * Platform-managed Recruitee credentials (backend/.env or secrets manager).
 * Users cannot configure Recruitee in Settings — only workspace LLM API keys.
 */

export function getPlatformRecruiteeApiKey(): string | null {
  const key = process.env.RECRUITEE_API_KEY?.trim();
  return key || null;
}

export function getPlatformRecruiteeNumericCompanyId(): string | null {
  const id = process.env.RECRUITEE_COMPANY_NUMERIC_ID?.trim();
  return id || null;
}

export function getPlatformRecruiteeBaseUrl(): string | null {
  const explicit = process.env.RECRUITEE_BASE_URL?.trim();
  if (explicit) return explicit;

  const companyId = process.env.RECRUITEE_COMPANY_ID?.trim();
  if (companyId) return `https://api.recruitee.com/c/${companyId}`;

  return null;
}

export function getPlatformRecruiteeActorLabel(): string {
  return process.env.RECRUITEE_API_TOKEN_LABEL?.trim() || 'platform integration account';
}

export function isPlatformRecruiteeConfigured(): boolean {
  return Boolean(getPlatformRecruiteeApiKey() && getPlatformRecruiteeBaseUrl());
}
