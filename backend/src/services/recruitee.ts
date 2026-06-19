import { getPlatformRecruiteeNumericCompanyId } from '../config/recruitee.js';
import type { RecruiteeJob, RecruiteeApplicant, RecruiteeApplicantsPayload, RecruiteePipelineStage } from '../types/index.js';

const TIMEOUT_MS = 10_000;
const CANDIDATES_LIST_TIMEOUT_MS = 30_000;
const ATS_HOST = 'api.recruitee.com';
const APPLICANTS_PAGE_SIZE = 500;
/** Recruitee list/search caps; avoid loading unbounded rows into the UI. */
const APPLICANTS_MAX_FETCH = 10_000;
/** Detail fetches are expensive — enrich location + CV for the first batch only. */
const APPLICANTS_DETAIL_ENRICH_MAX = 300;
const APPLICANTS_DETAIL_CONCURRENCY = 10;

/** Sentinel cv_url — real PDF is fetched by candidate id during screening. */
export const RECRUITEE_APPLICANT_CV_SENTINEL = 'recruitee-applicant';

let cachedNumericCompanyId: string | null = null;

/** Dev only: corporate VPN/proxy SSL inspection (self-signed cert in chain). */
if (process.env.RECRUITEE_TLS_INSECURE === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

export type RecruiteeConfig = {
  /** e.g. https://api.recruitee.com/c/nextventures */
  apiRoot: string;
  companyId: string;
};

/** Parse workspace recruitee_base_url into ATS API root + company id. */
function candidatesApiRoot(numericCompanyId: string): string {
  return `https://${ATS_HOST}/c/${numericCompanyId}`;
}

/**
 * Candidate endpoints require the numeric company id in the path (subdomain slug returns 422).
 * Offers/locations accept the careers subdomain slug.
 */
export async function resolveNumericCompanyId(
  baseUrl: string,
  apiKey: string,
): Promise<string> {
  const fromEnv = getPlatformRecruiteeNumericCompanyId();
  if (fromEnv) return fromEnv;
  if (cachedNumericCompanyId) return cachedNumericCompanyId;

  const { apiRoot: slugRoot } = parseRecruiteeConfig(baseUrl);
  const data = (await recruiteeGet(slugRoot, apiKey, '/search/new/candidates?limit=1')) as {
    hits?: Array<{ company_id?: number }>;
  };
  const companyId = data.hits?.[0]?.company_id;
  if (!companyId) {
    throw new Error('Could not resolve Recruitee numeric company ID');
  }
  cachedNumericCompanyId = String(companyId);
  return cachedNumericCompanyId;
}

export function parseRecruiteeConfig(baseUrl: string): RecruiteeConfig {
  const trimmed = baseUrl.trim().replace(/\/$/, '');

  const atsMatch = trimmed.match(/^https:\/\/api\.recruitee\.com\/c\/([^/]+)$/i);
  if (atsMatch) {
    return { apiRoot: `https://${ATS_HOST}/c/${atsMatch[1]}`, companyId: atsMatch[1] };
  }

  // Legacy careers-site style: https://nextventures.recruitee.com/api
  const careersMatch = trimmed.match(/^https:\/\/([^.]+)\.recruitee\.com\/api$/i);
  if (careersMatch) {
    const companyId = careersMatch[1];
    return { apiRoot: `https://${ATS_HOST}/c/${companyId}`, companyId };
  }

  throw new Error(
    'Invalid Recruitee base URL. Use https://api.recruitee.com/c/YOUR_COMPANY_ID (company ID or subdomain from Recruitee Settings → API tokens).',
  );
}

async function recruiteeGet(
  apiRoot: string,
  apiKey: string,
  path: string,
  timeoutMs = TIMEOUT_MS,
): Promise<unknown> {
  const url = `${apiRoot.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

  const parsed = new URL(url);
  if (parsed.hostname !== ATS_HOST) {
    throw new Error('Recruitee requests must use api.recruitee.com');
  }
  if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(parsed.hostname)) {
    throw new Error('SSRF: internal addresses not allowed');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Recruitee API error: ${res.status}${body ? ` — ${body.slice(0, 120)}` : ''}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

type OfferRow = {
  id?: number | string;
  title?: string;
  department?: string;
  department_name?: string;
  candidates_count?: number;
  status?: string;
  created_at?: string;
  published_at?: string;
  opened_at?: string;
  description?: string;
  description_html?: string;
};

export type OfferMeta = {
  title: string | null;
  applicants_count: number;
  department: string | null;
  posted_on: string | null;
  description: string | null;
};

function pickOfferDescription(offer: OfferRow): string | null {
  const html = offer.description_html?.trim();
  const text = offer.description?.trim();
  if (html) return html;
  if (text) return text;
  return null;
}

/** Recruitee list offers omit counts and dates; fetch from GET /offers/:id. */
async function fetchOfferMeta(
  apiRoot: string,
  apiKey: string,
  offerId: string | number,
): Promise<OfferMeta> {
  const data = (await recruiteeGet(apiRoot, apiKey, `/offers/${offerId}`)) as {
    offer?: OfferRow;
  };
  const offer = data.offer ?? (data as OfferRow);
  const posted =
    offer.created_at ?? offer.published_at ?? offer.opened_at ?? null;
  return {
    title: offer.title?.trim() || null,
    applicants_count:
      typeof offer.candidates_count === 'number' ? offer.candidates_count : 0,
    department: offer.department ?? offer.department_name ?? null,
    posted_on: posted,
    description: pickOfferDescription(offer),
  };
}

/** Fetch full offer metadata for one Recruitee position (used on job detail refresh). */
export async function fetchRecruiteeOfferMeta(
  baseUrl: string,
  apiKey: string,
  offerId: string,
): Promise<OfferMeta> {
  const { apiRoot } = parseRecruiteeConfig(baseUrl);
  return fetchOfferMeta(apiRoot, apiKey, offerId);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

function normalizeOffers(data: unknown): OfferRow[] {
  if (!data || typeof data !== 'object') return [];
  const root = data as Record<string, unknown>;
  const raw = root.offers ?? root;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (item && typeof item === 'object' && 'offer' in item) {
      return (item as { offer: OfferRow }).offer;
    }
    return item as OfferRow;
  });
}

type PlacementRow = {
  id?: number | string;
  offer_id?: number | string;
  stage_id?: number | string;
  stage_name?: string;
  location_ids?: Array<number | string>;
  department_name?: string;
  disqualified_at?: string | null;
  disqualify_reason?: string | null;
  positive_ratings?: number | null;
  created_at?: string;
};

function parseEvaluationScore(placement: PlacementRow | undefined): number | null {
  const value = placement?.positive_ratings;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(Math.max(0, Math.min(100, value)));
  }
  return null;
}

type CandidateFieldRow = {
  kind?: string;
  values?: Array<{ text?: string; city?: string; country_code?: string }>;
};

type CandidateRow = {
  id?: number | string;
  name?: string;
  emails?: string[];
  city?: string;
  cv_url?: string | null;
  cv_original_url?: string | null;
  photo_url?: string | null;
  photo_thumb_url?: string | null;
  created_at?: string;
  placements?: PlacementRow[];
  fields?: CandidateFieldRow[];
};

type LocationRow = {
  id?: number | string;
  name?: string;
  city?: string;
  country_code?: string;
  full_address?: string;
};

type PipelineStageRow = {
  id?: number | string;
  name?: string;
  position?: number;
  group?: string;
  category?: string;
};

function placementForOffer(
  candidate: CandidateRow,
  offerId: string,
): PlacementRow | undefined {
  const target = String(offerId);
  return candidate.placements?.find((p) => p.offer_id != null && String(p.offer_id) === target);
}

export async function fetchOfferPipeline(
  baseUrl: string,
  apiKey: string,
  offerId: string,
): Promise<RecruiteePipelineStage[]> {
  const { apiRoot } = parseRecruiteeConfig(baseUrl);
  const data = (await recruiteeGet(apiRoot, apiKey, `/offers/${offerId}`)) as Record<string, unknown>;
  const offer = (data.offer ?? data) as {
    pipeline_template?: { stages?: PipelineStageRow[] };
    pipeline?: { stages?: PipelineStageRow[] };
    stages?: PipelineStageRow[];
  };
  const stages =
    offer.pipeline_template?.stages
    ?? offer.pipeline?.stages
    ?? offer.stages
    ?? [];
  return stages
    .filter((stage) => stage.id != null && stage.name)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((stage, index) => ({
      id: String(stage.id),
      name: stage.name!,
      category: stage.group ?? stage.category ?? null,
      position: stage.position ?? index,
    }));
}

/** Stage id → name map derived from the ordered pipeline definition. */
function stageMapFromPipeline(stages: RecruiteePipelineStage[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const stage of stages) map.set(stage.id, stage.name);
  return map;
}

async function fetchLocationMap(
  apiRoots: string[],
  apiKey: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const apiRoot of apiRoots) {
    try {
      const data = (await recruiteeGet(apiRoot, apiKey, '/locations')) as {
        locations?: LocationRow[];
      };
      for (const loc of data.locations ?? []) {
        if (loc.id == null) continue;
        map.set(String(loc.id), formatRecruiteeLocation(loc));
      }
      if (map.size > 0) break;
    } catch {
      // Try the next API root (slug vs numeric company id).
    }
  }
  return map;
}

function formatRecruiteeLocation(loc: LocationRow): string {
  const cityCountry = [loc.city, loc.country_code].filter(Boolean).join(', ');
  if (cityCountry) return cityCountry;
  if (loc.name) return loc.name;
  return loc.full_address?.trim() || '—';
}

function pickAddressFromFields(fields?: CandidateFieldRow[]): string | null {
  const addressField = fields?.find((f) => f.kind === 'address');
  for (const value of addressField?.values ?? []) {
    const text = value.text?.trim();
    if (text) return text;
    const cityCountry = [value.city, value.country_code].filter(Boolean).join(', ');
    if (cityCountry) return cityCountry;
  }
  return null;
}

function resolveCandidateLocation(
  candidate: CandidateRow,
  offerId: string,
  locationById: Map<string, string>,
): string | null {
  const placement = placementForOffer(candidate, offerId);
  let location: string | null = candidate.city?.trim() ?? null;
  const locationId = placement?.location_ids?.[0];
  if (locationId != null) {
    location = locationById.get(String(locationId)) ?? location;
  }
  if (!location) {
    location = pickAddressFromFields(candidate.fields);
  }
  return location || null;
}

async function enrichRecruiteeApplicant(
  candidateRoot: string,
  apiKey: string,
  candidate: CandidateRow,
  offerId: string,
  stageById: Map<string, string>,
  locationById: Map<string, string>,
): Promise<RecruiteeApplicant> {
  const fromList = mapCandidateToApplicant(candidate, offerId, stageById, locationById);
  try {
    const data = (await recruiteeGet(candidateRoot, apiKey, `/candidates/${candidate.id}`)) as {
      candidate?: CandidateRow;
    };
    const detail: CandidateRow = { ...candidate, ...(data.candidate ?? {}) };
    return mapCandidateToApplicant(detail, offerId, stageById, locationById);
  } catch {
    return applyRecruiteeApplicantCvUrl(fromList, { assumeFetchable: true });
  }
}

/** CV source for screening runs when list/detail omits a direct URL. */
export function recruiteeApplicantCvSource(applicant: Pick<RecruiteeApplicant, 'id' | 'cv_url'>): string {
  if (applicant.cv_url?.startsWith('http')) return applicant.cv_url;
  return `${RECRUITEE_APPLICANT_CV_SENTINEL}:${applicant.id}`;
}

/** Keep list URLs; for applicants not detail-checked, allow fetch-by-id during screening. */
function applyRecruiteeApplicantCvUrl(
  applicant: RecruiteeApplicant,
  options: { assumeFetchable?: boolean } = {},
): RecruiteeApplicant {
  if (applicant.cv_url?.startsWith('http')) return applicant;
  if (options.assumeFetchable) {
    applicant.cv_url = recruiteeApplicantCvSource(applicant);
  }
  return applicant;
}

export function recruiteeApplicantHasCv(cvUrl: string | null | undefined): boolean {
  if (!cvUrl) return false;
  if (cvUrl.startsWith('http')) return true;
  return cvUrl.startsWith(`${RECRUITEE_APPLICANT_CV_SENTINEL}:`);
}

function resolveCvUrlFromRow(candidate: CandidateRow): string | null {
  const url = candidate.cv_url ?? candidate.cv_original_url;
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `https://${ATS_HOST}/${url.replace(/^\//, '')}`;
}

export async function fetchRecruiteeJobs(baseUrl: string, apiKey: string): Promise<RecruiteeJob[]> {
  const { apiRoot } = parseRecruiteeConfig(baseUrl);
  const data = await recruiteeGet(apiRoot, apiKey, '/offers?scope=active');
  const offers = normalizeOffers(data).filter(
    (o) => o.id != null && o.title && o.status !== 'closed',
  );

  const meta = await mapWithConcurrency(offers, 8, async (o) => {
    try {
      return await fetchOfferMeta(apiRoot, apiKey, o.id!);
    } catch {
      return {
        applicants_count: 0,
        department: o.department ?? null,
        posted_on: null,
        description: null,
      };
    }
  });

  return offers.map((o, i) => ({
    id: String(o.id),
    title: o.title!,
    department: meta[i].department ?? o.department ?? null,
    applicants_count: meta[i].applicants_count,
    posted_on: meta[i].posted_on,
    description: meta[i].description,
    status: o.status ?? 'published',
  }));
}

/**
 * Order applicants by the role's Recruitee pipeline order so the UI can render
 * contiguous stage groups. `stageById` is built from `pipeline_template.stages`,
 * whose insertion order is the pipeline order. Applicants with no/unknown stage
 * sort last, preserving their original relative order (stable).
 */
function resolveStageName(
  stageId: string | null,
  placement: PlacementRow | undefined,
  stageById: Map<string, string>,
): string | null {
  if (stageId && stageById.has(stageId)) return stageById.get(stageId)!;
  return placement?.stage_name?.trim() ?? null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** First syntactically valid email from Recruitee payload, lowercased. */
export function pickPrimaryEmail(emails: string[] | undefined): string | null {
  if (!emails?.length) return null;
  for (const raw of emails) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim().toLowerCase();
    if (trimmed && EMAIL_RE.test(trimmed)) return trimmed;
  }
  return null;
}

function mapCandidateToApplicant(
  candidate: CandidateRow,
  offerId: string,
  stageById: Map<string, string>,
  locationById: Map<string, string>,
): RecruiteeApplicant {
  const placement = placementForOffer(candidate, offerId);
  const stageId = placement?.stage_id != null ? String(placement.stage_id) : null;
  const stageName = resolveStageName(stageId, placement, stageById);
  const disqualified = Boolean(placement?.disqualified_at);
  const disqualifyReason =
    typeof placement?.disqualify_reason === 'string' && placement.disqualify_reason.trim()
      ? placement.disqualify_reason.trim()
      : null;

  return {
    id: String(candidate.id),
    placement_id: placement?.id != null ? String(placement.id) : null,
    name: candidate.name!,
    email: pickPrimaryEmail(candidate.emails),
    location: resolveCandidateLocation(candidate, offerId, locationById),
    cv_url: resolveCvUrlFromRow(candidate),
    stage_id: stageId,
    stage_name: stageName,
    status: stageName,
    disqualified,
    disqualify_reason: disqualifyReason,
    photo_url: candidate.photo_thumb_url ?? candidate.photo_url ?? null,
    created_at: placement?.created_at ?? candidate.created_at ?? null,
    evaluation_score: parseEvaluationScore(placement),
  };
}

const DISQUALIFIED_FETCH_MAX = 500;

async function fetchCandidatesForOffer(
  candidateRoot: string,
  apiKey: string,
  jobId: string,
  options?: { filter?: 'qualified' | 'disqualified'; max?: number },
): Promise<CandidateRow[]> {
  const filterParam =
    options?.filter === 'qualified'
      ? '&qualified=true'
      : options?.filter === 'disqualified'
        ? '&disqualified=true'
        : '';
  const max = options?.max ?? APPLICANTS_MAX_FETCH;
  const candidates: CandidateRow[] = [];
  let offset = 0;

  while (candidates.length < max) {
    const limit = Math.min(APPLICANTS_PAGE_SIZE, max - candidates.length);
    const data = (await recruiteeGet(
      candidateRoot,
      apiKey,
      `/candidates?offer_id=${encodeURIComponent(jobId)}&limit=${limit}&offset=${offset}${filterParam}`,
      CANDIDATES_LIST_TIMEOUT_MS,
    )) as { candidates?: CandidateRow[] };

    const page = data.candidates ?? [];
    if (page.length === 0) break;
    candidates.push(...page);
    if (page.length < limit) break;
    offset += page.length;
  }

  return candidates;
}

export async function fetchRecruiteeApplicants(
  baseUrl: string,
  apiKey: string,
  jobId: string,
): Promise<RecruiteeApplicantsPayload> {
  const { apiRoot: slugApiRoot } = parseRecruiteeConfig(baseUrl);
  const numericCompanyId = await resolveNumericCompanyId(baseUrl, apiKey);
  const candidateRoot = candidatesApiRoot(numericCompanyId);

  const [pipelineStages, locationById, offerMeta, disqualifiedRaw, qualifiedRaw] = await Promise.all([
    fetchOfferPipeline(baseUrl, apiKey, jobId),
    fetchLocationMap([slugApiRoot, candidateRoot], apiKey),
    fetchOfferMeta(slugApiRoot, apiKey, jobId),
    fetchCandidatesForOffer(candidateRoot, apiKey, jobId, {
      filter: 'disqualified',
      max: DISQUALIFIED_FETCH_MAX,
    }),
    fetchCandidatesForOffer(candidateRoot, apiKey, jobId, {
      filter: 'qualified',
      max: APPLICANTS_MAX_FETCH,
    }),
  ]);
  const stageById = stageMapFromPipeline(pipelineStages);

  const disqualifiedIds = new Set(
    disqualifiedRaw.filter((c) => c.id).map((c) => String(c.id)),
  );
  const mergedRaw: CandidateRow[] = [];
  const seen = new Set<string>();
  for (const candidate of [...disqualifiedRaw, ...qualifiedRaw]) {
    if (!candidate.id || seen.has(String(candidate.id))) continue;
    seen.add(String(candidate.id));
    mergedRaw.push(candidate);
  }

  const filtered = mergedRaw.filter((c) => c.id && c.name);
  const disqualified_count = filtered.filter((c) => disqualifiedIds.has(String(c.id))).length;
  const qualified_count = Math.max(0, offerMeta.applicants_count - disqualified_count);

  if (filtered.length === 0) {
    return {
      pipeline: { stages: pipelineStages },
      qualified_count: 0,
      disqualified_count: 0,
      applicants: [],
    };
  }

  const enrichCount = Math.min(filtered.length, APPLICANTS_DETAIL_ENRICH_MAX);
  const toEnrich = filtered.slice(0, enrichCount);
  const remainder = filtered.slice(enrichCount);

  const enriched = await mapWithConcurrency(
    toEnrich,
    APPLICANTS_DETAIL_CONCURRENCY,
    async (candidate) =>
      enrichRecruiteeApplicant(candidateRoot, apiKey, candidate, jobId, stageById, locationById),
  );

  const rest = remainder.map((candidate) => {
    const row = mapCandidateToApplicant(candidate, jobId, stageById, locationById);
    return applyRecruiteeApplicantCvUrl(row, { assumeFetchable: true });
  });

  const applicants = [...enriched, ...rest];

  return {
    pipeline: { stages: pipelineStages },
    qualified_count,
    disqualified_count,
    applicants,
  };
}

export async function fetchRecruiteeCandidateCv(
  baseUrl: string,
  apiKey: string,
  candidateId: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const candidateRoot = candidatesApiRoot(await resolveNumericCompanyId(baseUrl, apiKey));
  const data = (await recruiteeGet(candidateRoot, apiKey, `/candidates/${candidateId}`)) as {
    candidate?: CandidateRow;
  };
  const detail = data.candidate;
  if (!detail?.id) throw new Error('Candidate not found');

  const cvUrl = resolveCvUrlFromRow(detail);
  if (!cvUrl) throw new Error('No CV attached for this candidate');

  const buffer = await downloadRecruiteeCV(cvUrl, apiKey);
  const baseName = (detail.name ?? 'candidate').replace(/[^\w\s.-]/g, '').trim() || 'candidate';
  return { buffer, filename: `${baseName}.pdf` };
}

/** Resolve Recruitee placement id for a candidate on a specific offer/job. */
export async function fetchRecruiteePlacementIdForOffer(
  baseUrl: string,
  apiKey: string,
  candidateId: string,
  offerId: string,
): Promise<string | null> {
  const candidateRoot = candidatesApiRoot(await resolveNumericCompanyId(baseUrl, apiKey));
  const data = (await recruiteeGet(candidateRoot, apiKey, `/candidates/${candidateId}`)) as {
    candidate?: CandidateRow;
  };
  const placement = placementForOffer(data.candidate ?? {}, offerId);
  return placement?.id != null ? String(placement.id) : null;
}

/** First disqualify reason (Recruitee requires a reason id to disqualify via the API). */
export async function fetchDefaultDisqualifyReasonId(
  baseUrl: string,
  apiKey: string,
): Promise<string | null> {
  const apiRoot = candidatesApiRoot(await resolveNumericCompanyId(baseUrl, apiKey));
  try {
    const data = (await recruiteeGet(apiRoot, apiKey, '/disqualify_reasons')) as {
      disqualify_reasons?: Array<{ id?: number; position?: number }>;
    };
    const reasons = (data.disqualify_reasons ?? []).filter((r) => r.id != null);
    if (reasons.length === 0) return null;
    reasons.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return String(reasons[0].id);
  } catch {
    return null;
  }
}

function isPresignedS3Url(parsed: URL): boolean {
  return (
    parsed.hostname.endsWith('.amazonaws.com')
    && parsed.searchParams.has('X-Amz-Signature')
  );
}

export async function downloadRecruiteeCV(cvUrl: string, apiKey: string): Promise<Buffer> {
  let url = cvUrl;
  if (!url.startsWith('http')) {
    url = `https://${ATS_HOST}/${url.replace(/^\//, '')}`;
  }

  const parsed = new URL(url);
  if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(parsed.hostname)) {
    throw new Error('SSRF: internal addresses not allowed');
  }
  if (parsed.hostname !== ATS_HOST && !parsed.hostname.endsWith('.amazonaws.com')) {
    throw new Error('CV download host not allowed');
  }

  // Recruitee returns time-limited S3 pre-signed URLs; Bearer auth conflicts with them.
  const headers: Record<string, string> = {};
  if (parsed.hostname === ATS_HOST) {
    headers.Authorization = `Bearer ${apiKey}`;
  } else if (!isPresignedS3Url(parsed)) {
    throw new Error('CV download URL is not a valid pre-signed S3 link');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Failed to download CV: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}
