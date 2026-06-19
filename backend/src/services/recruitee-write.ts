import { getPlatformRecruiteeActorLabel } from '../config/recruitee.js';
import { resolveNumericCompanyId, fetchDefaultDisqualifyReasonId } from './recruitee.js';

const TIMEOUT_MS = 10_000;
const ATS_HOST = 'api.recruitee.com';

export { getPlatformRecruiteeActorLabel as getPlatformRecruiteeActor };

async function recruiteePatch(
  apiRoot: string,
  apiKey: string,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const url = `${apiRoot.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  const parsed = new URL(url);
  if (parsed.hostname !== ATS_HOST) {
    throw new Error('Recruitee requests must use api.recruitee.com');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Recruitee API error: ${res.status}${text ? ` — ${text.slice(0, 200)}` : ''}`);
    }
    return res.json().catch(() => ({}));
  } finally {
    clearTimeout(timer);
  }
}

async function candidateApiRoot(baseUrl: string, apiKey: string): Promise<string> {
  const numericCompanyId = await resolveNumericCompanyId(baseUrl, apiKey);
  return `https://${ATS_HOST}/c/${numericCompanyId}`;
}

export async function changePlacementStage(
  baseUrl: string,
  apiKey: string,
  placementId: string,
  stageId: string,
): Promise<void> {
  const apiRoot = await candidateApiRoot(baseUrl, apiKey);
  await recruiteePatch(apiRoot, apiKey, `/placements/${placementId}/change_stage`, {
    stage_id: Number(stageId),
  });
}

/** Re-qualify a disqualified placement and move to an active stage. */
export async function qualifyPlacement(
  baseUrl: string,
  apiKey: string,
  placementId: string,
  stageId: string,
): Promise<void> {
  const apiRoot = await candidateApiRoot(baseUrl, apiKey);
  const stage = Number(stageId);
  await recruiteePatch(apiRoot, apiKey, `/placements/${placementId}/requalify`, {
    stage_id: stage,
  });
  await recruiteePatch(apiRoot, apiKey, `/placements/${placementId}/change_stage`, {
    stage_id: stage,
  });
}

export async function disqualifyPlacement(
  baseUrl: string,
  apiKey: string,
  placementId: string,
  reasonId?: string | null,
): Promise<void> {
  const apiRoot = await candidateApiRoot(baseUrl, apiKey);
  const resolvedReason = reasonId ?? (await fetchDefaultDisqualifyReasonId(baseUrl, apiKey));
  const body: Record<string, unknown> = {};
  if (resolvedReason) body.disqualify_reason_id = Number(resolvedReason);
  await recruiteePatch(apiRoot, apiKey, `/placements/${placementId}/change_stage`, body);
}

/** Fallback when placement id is missing but candidate + offer are known. */
export async function changeCandidateStageForOffer(
  baseUrl: string,
  apiKey: string,
  candidateId: string,
  offerId: string,
  stageId: string,
): Promise<void> {
  const apiRoot = await candidateApiRoot(baseUrl, apiKey);
  await recruiteePatch(apiRoot, apiKey, '/bulk/candidates/change_stage', {
    candidates: [Number(candidateId)],
    offer_id: Number(offerId),
    stage_id: Number(stageId),
  });
}

/** Re-qualify a disqualified candidate for an offer and move to an active stage. */
export async function qualifyCandidateForOffer(
  baseUrl: string,
  apiKey: string,
  candidateId: string,
  offerId: string,
  stageId: string,
): Promise<void> {
  const apiRoot = await candidateApiRoot(baseUrl, apiKey);
  const stage = Number(stageId);
  const offer = Number(offerId);
  const candidate = Number(candidateId);
  await recruiteePatch(apiRoot, apiKey, '/bulk/candidates/requalify', {
    candidates: [candidate],
    offer_id: offer,
    stage_id: stage,
  });
  await recruiteePatch(apiRoot, apiKey, '/bulk/candidates/change_stage', {
    candidates: [candidate],
    offer_id: offer,
    stage_id: stage,
  });
}

export async function disqualifyCandidateForOffer(
  baseUrl: string,
  apiKey: string,
  candidateId: string,
  offerId: string,
  reasonId?: string | null,
): Promise<void> {
  const apiRoot = await candidateApiRoot(baseUrl, apiKey);
  const resolvedReason = reasonId ?? (await fetchDefaultDisqualifyReasonId(baseUrl, apiKey));
  const body: Record<string, unknown> = {
    candidates: [Number(candidateId)],
    offer_id: Number(offerId),
  };
  if (resolvedReason) body.disqualify_reason_id = Number(resolvedReason);
  await recruiteePatch(apiRoot, apiKey, '/bulk/candidates/disqualify', body);
}
