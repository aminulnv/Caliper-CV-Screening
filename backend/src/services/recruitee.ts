import type { RecruiteeJob, RecruiteeApplicant } from '../types/index.js';

const TIMEOUT_MS = 10_000;
const ATS_HOST = 'api.recruitee.com';

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

async function recruiteeGet(apiRoot: string, apiKey: string, path: string): Promise<unknown> {
  const url = `${apiRoot.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

  const parsed = new URL(url);
  if (parsed.hostname !== ATS_HOST) {
    throw new Error('Recruitee requests must use api.recruitee.com');
  }
  if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(parsed.hostname)) {
    throw new Error('SSRF: internal addresses not allowed');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

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
  offer_id?: number | string;
  stage_id?: number | string;
  stage_name?: string;
  location_ids?: Array<number | string>;
  department_name?: string;
};

type CandidateFieldRow = {
  kind?: string;
  values?: Array<{ text?: string; city?: string; country_code?: string }>;
};

type CandidateRow = {
  id?: number | string;
  name?: string;
  city?: string;
  cv_url?: string | null;
  cv_original_url?: string | null;
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
};

function placementForOffer(
  candidate: CandidateRow,
  offerId: string,
): PlacementRow | undefined {
  const target = String(offerId);
  return candidate.placements?.find((p) => p.offer_id != null && String(p.offer_id) === target);
}

async function fetchOfferStageMap(
  apiRoot: string,
  apiKey: string,
  offerId: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const data = (await recruiteeGet(apiRoot, apiKey, `/offers/${offerId}`)) as {
      offer?: { pipeline_template?: { stages?: PipelineStageRow[] } };
    };
    const stages = data.offer?.pipeline_template?.stages ?? [];
    for (const stage of stages) {
      if (stage.id != null && stage.name) {
        map.set(String(stage.id), stage.name);
      }
    }
  } catch {
    // Stage names are optional; applicants still load without them.
  }
  return map;
}

async function fetchLocationMap(
  apiRoot: string,
  apiKey: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const data = (await recruiteeGet(apiRoot, apiKey, '/locations')) as {
      locations?: LocationRow[];
    };
    for (const loc of data.locations ?? []) {
      if (loc.id == null) continue;
      map.set(String(loc.id), formatRecruiteeLocation(loc));
    }
  } catch {
    // Location labels are optional.
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
  const text = addressField?.values?.find((v) => v.text?.trim())?.text?.trim();
  return text || null;
}

function resolveCvUrlFromRow(candidate: CandidateRow): string | null {
  const url = candidate.cv_url ?? candidate.cv_original_url;
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `https://${ATS_HOST}/${url.replace(/^\//, '')}`;
}

async function enrichRecruiteeCandidate(
  apiRoot: string,
  apiKey: string,
  candidate: CandidateRow,
  offerId: string,
  stageById: Map<string, string>,
  locationById: Map<string, string>,
): Promise<RecruiteeApplicant> {
  const data = (await recruiteeGet(apiRoot, apiKey, `/candidates/${candidate.id}`)) as {
    candidate?: CandidateRow;
  };
  const detail: CandidateRow = { ...candidate, ...(data.candidate ?? {}) };
  const placement = placementForOffer(detail, offerId);

  let status: string | null = null;
  if (placement?.stage_name) {
    status = placement.stage_name;
  } else if (placement?.stage_id != null) {
    status = stageById.get(String(placement.stage_id)) ?? null;
  }

  let location: string | null = null;
  const locationId = placement?.location_ids?.[0];
  if (locationId != null) {
    location = locationById.get(String(locationId)) ?? null;
  }
  if (!location) {
    location = pickAddressFromFields(detail.fields) ?? detail.city?.trim() ?? null;
  }

  return {
    id: String(detail.id),
    name: detail.name!,
    location,
    cv_url: resolveCvUrlFromRow(detail),
    status,
  };
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

export async function fetchRecruiteeApplicants(
  baseUrl: string,
  apiKey: string,
  jobId: string,
): Promise<RecruiteeApplicant[]> {
  const { apiRoot } = parseRecruiteeConfig(baseUrl);
  const data = (await recruiteeGet(
    apiRoot,
    apiKey,
    `/candidates?offer_id=${encodeURIComponent(jobId)}&limit=200`,
  )) as { candidates?: CandidateRow[] };

  const candidates = data.candidates ?? [];
  const [stageById, locationById] = await Promise.all([
    fetchOfferStageMap(apiRoot, apiKey, jobId),
    fetchLocationMap(apiRoot, apiKey),
  ]);

  const results = await mapWithConcurrency(
    candidates.filter((c) => c.id && c.name),
    6,
    async (c) => {
      try {
        return await enrichRecruiteeCandidate(
          apiRoot,
          apiKey,
          c,
          jobId,
          stageById,
          locationById,
        );
      } catch {
        const placement = placementForOffer(c, jobId);
        const stageId = placement?.stage_id;
        return {
          id: String(c.id),
          name: c.name!,
          location: c.city ?? null,
          cv_url: null,
          status:
            placement?.stage_name
            ?? (stageId != null ? stageById.get(String(stageId)) ?? null : null),
        };
      }
    },
  );

  return results;
}

export async function fetchRecruiteeCandidateCv(
  baseUrl: string,
  apiKey: string,
  candidateId: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const { apiRoot } = parseRecruiteeConfig(baseUrl);
  const data = (await recruiteeGet(apiRoot, apiKey, `/candidates/${candidateId}`)) as {
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
