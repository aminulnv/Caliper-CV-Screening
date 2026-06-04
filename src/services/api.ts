import { getIdToken } from '../lib/auth';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export class NeedsCountryError extends Error {
  readonly needsCountry = true;

  constructor(message: string) {
    super(message);
    this.name = 'NeedsCountryError';
  }
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const token = await getIdToken();
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}` };
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    ...(await getAuthHeader()),
  };
  const hasBody = body != null;
  if (hasBody) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: hasBody ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string; message?: string };
    const generic =
      err.error?.toLowerCase() === 'internal server error' && err.message
        ? err.message
        : null;
    throw new Error(
      generic ?? err.error ?? err.message ?? res.statusText ?? `Request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

async function discoverRelatedProfilesRequest(
  jobId: string,
  body?: { linkedin_urls?: string[]; limit?: number; search_country?: string; model_id?: string },
): Promise<DiscoverRelatedProfilesResponse> {
  const headers: Record<string, string> = {
    ...(await getAuthHeader()),
    'Content-Type': 'application/json',
  };

  const res = await fetch(`${BASE_URL}/api/v1/jobs/${jobId}/related-profiles/discover`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
  });

  const payload = await res.json().catch(() => ({})) as {
    error?: string;
    message?: string;
    needs_country?: boolean;
  };

  if (res.status === 422 && payload.needs_country) {
    throw new NeedsCountryError(payload.error ?? 'Select a country or Global to continue.');
  }

  if (!res.ok) {
    const generic =
      payload.error?.toLowerCase() === 'internal server error' && payload.message
        ? payload.message
        : null;
    throw new Error(
      generic ?? payload.error ?? payload.message ?? res.statusText ?? `Request failed: ${res.status}`,
    );
  }

  return payload as DiscoverRelatedProfilesResponse;
}

// ── Runs ───────────────────────────────────────────────────────────────────────
export const api = {
  runs: {
    list: () => request<RunListItem[]>('GET', '/api/v1/runs'),
    get: (id: string) => request<RunDetail>('GET', `/api/v1/runs/${id}`),
    create: (body: CreateRunBody) =>
      request<{
        run_id: string;
        status: string;
        model_used?: string;
        model_substituted?: boolean;
        model_notice?: string;
      }>('POST', '/api/v1/runs', body),
  },

  candidates: {
    getEvaluation: (candidateId: string) =>
      request<CandidateEvaluationResponse>('GET', `/api/v1/candidates/${candidateId}/evaluation`),
    fetchCvBlobUrl: async (candidateId: string): Promise<string> => {
      const headers = await getAuthHeader();
      const res = await fetch(`${BASE_URL}/api/v1/candidates/${candidateId}/cv`, { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? 'Could not load CV');
      }
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    },
    override: (evalId: string, met: boolean, note: string) =>
      request<{ success: boolean }>('PATCH', `/api/v1/evaluations/${evalId}/override`, { met, override_note: note }),
  },

  cv: {
    upload: async (file: File): Promise<{ path: string; filename: string }> => {
      const headers = await getAuthHeader();
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${BASE_URL}/api/v1/cv/upload`, {
        method: 'POST',
        headers,
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((err as { error?: string }).error ?? 'Upload failed');
      }
      return res.json();
    },
  },

  jobs: {
    list: () => request<JobProfile[]>('GET', '/api/v1/jobs'),
    get: (id: string) => request<JobProfileDetail>('GET', `/api/v1/jobs/${id}`),
    refreshFromRecruitee: (id: string) =>
      request<JobProfileDetail>('POST', `/api/v1/jobs/${id}/refresh-recruitee`, {}),
    upsert: (id: string, body: UpsertJobBody) => request<{ success: boolean }>('PUT', `/api/v1/jobs/${id}`, body),
    generateCriteria: (id: string, body?: GenerateCriteriaBody) =>
      request<GenerateCriteriaResponse>('POST', `/api/v1/jobs/${id}/generate-criteria`, body ?? {}),
    audit: (id: string) => request<JobAuditEntry[]>('GET', `/api/v1/jobs/${id}/audit`),
    relatedProfiles: (id: string) =>
      request<RelatedProfileRow[]>('GET', `/api/v1/jobs/${id}/related-profiles`),
    discoverRelatedProfiles: (
      id: string,
      body?: { linkedin_urls?: string[]; limit?: number; search_country?: string; model_id?: string },
    ) => discoverRelatedProfilesRequest(id, body),
    deleteRelatedProfile: (jobId: string, profileId: string) =>
      request<{ success: boolean }>(
        'DELETE',
        `/api/v1/jobs/${jobId}/related-profiles/${profileId}`,
      ),
  },

  recruitee: {
    syncJobs: () =>
      request<{ created: number; updated: number; closed: number; total: number }>(
        'POST',
        '/api/v1/recruitee/sync-jobs',
        {},
      ),
    jobs: () => request<RecruiteeJob[]>('GET', '/api/v1/recruitee/jobs'),
    applicants: (jobId: string) =>
      request<RecruiteeApplicant[]>('GET', `/api/v1/recruitee/jobs/${jobId}/applicants`),
    fetchCv: async (candidateId: string): Promise<Blob> => {
      const headers = await getAuthHeader();
      const res = await fetch(
        `${BASE_URL}/api/v1/recruitee/candidates/${encodeURIComponent(candidateId)}/cv`,
        { headers },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Failed to load CV (${res.status})`);
      }
      return res.blob();
    },
  },

  settings: {
    get: () => request<WorkspaceSettings>('GET', '/api/v1/settings'),
    update: (body: UpdateSettingsBody) => request<{ success: boolean }>('PUT', '/api/v1/settings', body),
    testRecruitee: (body?: { recruitee_base_url?: string; recruitee_key?: string }) =>
      request<{ success: boolean; jobs_found: number }>(
        'POST',
        '/api/v1/settings/test-recruitee',
        body ?? {},
      ),
  },
};

// ── Types (mirror backend) ─────────────────────────────────────────────────────
export interface RunListItem {
  id: string;
  job_id: string;
  model_used: string | null;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  owner_id: string;
  cv_count: number;
  score_range: number[] | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  job_profiles: { name: string; dept: string | null } | null;
}

export interface RunDetail extends RunListItem {
  candidates: CandidateRow[];
}

export interface CandidateRow {
  id: string;
  name: string | null;
  title: string | null;
  location: string | null;
  score: number | null;
  confidence: 'high' | 'medium' | 'low' | null;
  status: 'strong' | 'promising' | 'review' | 'flagged' | null;
  summary: string | null;
  parse_warning: string | null;
  must_met: number;
  nice_met: number;
  flag_triggered: number;
  score_base?: number | null;
  penalty_must?: number | null;
  penalty_flag?: number | null;
  must_total?: number | null;
  nice_total?: number | null;
  flag_total?: number | null;
  criteria_met_pct?: number | null;
  must_met_pct?: number | null;
  nice_met_pct?: number | null;
  has_cv?: boolean;
}

export interface CandidateEvaluationResponse {
  candidate: CandidateRow;
  evaluations: EvaluationItem[];
}

export interface EvaluationItem {
  id: string;
  criterion_id: string;
  met: boolean | null;
  confidence: 'high' | 'medium' | 'low' | null;
  quote: string | null;
  inferred: boolean;
  notes: string | null;
  overridden_by: string | null;
  override_note: string | null;
  created_at: string;
  job_criteria: {
    kind: 'must' | 'nice' | 'flag';
    name: string;
    weight: number;
    biased: boolean;
  } | null;
}

export interface JobProfile {
  id: string;
  name: string;
  dept: string | null;
  status: string;
  source: string;
  source_ref: string | null;
  description: string | null;
  posted_on: string | null;
  applicants_count: number | null;
  updated_at: string;
  job_criteria: CriterionItem[];
}

export interface JobProfileDetail extends JobProfile {
  screening_runs: { id: string; status: string; cv_count: number; created_at: string; score_range: number[] | null }[];
}

export interface CriterionItem {
  id: string;
  kind: 'must' | 'nice' | 'flag';
  name: string;
  weight: number;
  biased: boolean;
}

export interface JobAuditEntry {
  id: string;
  ts: string;
  who: string;
  msg: string;
  reason: string;
  warned: boolean;
  kind: 'job' | 'criteria' | 'run' | 'override' | 'sync' | 'other';
  runId: string | null;
}

export interface RelatedProfileRow {
  id: string;
  job_id: string;
  name: string;
  title: string | null;
  company: string | null;
  location: string | null;
  linkedin_url: string | null;
  headline: string | null;
  profile_summary: string | null;
  alignment_stars: 1 | 2 | 3 | 4 | 5 | null;
  alignment_rationale: string | null;
  source: string;
  discovered_at: string;
  created_at: string;
}

export interface DiscoverRelatedProfilesResponse {
  discovery_id: string;
  profiles_found: number;
  search_query: string;
  urls_found: number;
  search_provider: string;
  location_query?: string | null;
  location_scope?: string | null;
  seniority_level?: string | null;
  model_id?: string;
  model_substituted?: boolean;
  exa_profiles?: number;
  nubela_profiles?: number;
  auto_scored?: boolean;
  profiles: RelatedProfileRow[];
}

export interface UpsertJobBody {
  name: string;
  dept?: string;
  status?: string;
  source?: string;
  source_ref?: string;
  description?: string;
  posted_on?: string;
  screening_model?: string | null;
  criteria?: CriterionItem[];
}

export interface GenerateCriteriaBody {
  model_id?: string;
  description?: string;
}

export interface GeneratedCriterionItem {
  name: string;
  weight: number;
}

export interface GenerateCriteriaResponse {
  must_have: GeneratedCriterionItem[];
  nice_to_have: GeneratedCriterionItem[];
  red_flags: GeneratedCriterionItem[];
  skipped_count: number;
  model_used: string;
  model_substituted?: boolean;
}

export interface CreateRunBody {
  job_id: string;
  model_id?: string;
  cv_sources: Array<
    | { type: 'storage'; path: string; name: string }
    | { type: 'recruitee'; applicant_id: string; cv_url: string; name: string }
  >;
}

export interface RecruiteeJob {
  id: string;
  title: string;
  department: string | null;
  applicants_count: number;
}

export interface RecruiteeApplicant {
  id: string;
  name: string;
  location: string | null;
  cv_url: string | null;
  status: string | null;
}

export interface WorkspaceSettings {
  workspace_id: string;
  default_model: string;
  allowed_models: string[];
  recruitee_base_url: string | null;
  confidence_threshold: number;
  cv_retention_days: number;
  /** null = keep evaluation results indefinitely */
  evaluation_retention_days: number | null;
  has_anthropic_key: boolean;
  has_openai_key: boolean;
  has_recruitee_key: boolean;
  supported_models: string[];
}

export interface UpdateSettingsBody {
  default_model?: string;
  allowed_models?: string[];
  anthropic_key?: string;
  openai_key?: string;
  recruitee_base_url?: string;
  recruitee_key?: string;
  confidence_threshold?: number;
  cv_retention_days?: number;
  evaluation_retention_days?: number | null;
}
