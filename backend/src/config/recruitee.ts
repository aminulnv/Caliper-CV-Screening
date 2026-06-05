/** Platform-managed Recruitee credentials (set in backend/.env / secrets manager). */

export function getPlatformRecruiteeApiKey(): string | null {
  const key = process.env.RECRUITEE_API_KEY?.trim();
  return key || null;
}

export function getPlatformRecruiteeBaseUrl(): string | null {
  const explicit = process.env.RECRUITEE_BASE_URL?.trim();
  if (explicit) return explicit;

  const companyId = process.env.RECRUITEE_COMPANY_ID?.trim();
  if (companyId) return `https://api.recruitee.com/c/${companyId}`;

  return null;
}

export function isPlatformRecruiteeConfigured(): boolean {
  return Boolean(getPlatformRecruiteeApiKey() && getPlatformRecruiteeBaseUrl());
}
