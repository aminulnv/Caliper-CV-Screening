import type { RecruiteeApplicantsResponse } from '@/services/api';
import { api } from '@/services/api';

const APPLICANTS_TTL_MS = 10 * 60 * 1000;

type CacheEntry = {
  data: RecruiteeApplicantsResponse;
  fetchedAt: number;
};

const memory = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<RecruiteeApplicantsResponse>>();

function storageKey(sourceRef: string): string {
  return `caliper:applicants:v6:${sourceRef}`;
}

function readStorage(sourceRef: string): CacheEntry | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(storageKey(sourceRef));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed?.data?.applicants || !Array.isArray(parsed.data.applicants) || typeof parsed.fetchedAt !== 'number') {
      return null;
    }
    if (Date.now() - parsed.fetchedAt > APPLICANTS_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStorage(sourceRef: string, entry: CacheEntry): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(storageKey(sourceRef), JSON.stringify(entry));
  } catch {
    // Quota or private mode — memory cache still works.
  }
}

export function getCachedApplicants(
  sourceRef: string | null | undefined,
): RecruiteeApplicantsResponse | null {
  if (!sourceRef) return null;
  const mem = memory.get(sourceRef);
  if (mem && Date.now() - mem.fetchedAt <= APPLICANTS_TTL_MS) return mem.data;
  const stored = readStorage(sourceRef);
  if (stored) {
    memory.set(sourceRef, stored);
    return stored.data;
  }
  return null;
}

/** Drop cached applicants so the next load refetches from Recruitee (e.g. after a stage move). */
export function invalidateApplicants(sourceRef: string | null | undefined): void {
  if (!sourceRef) return;
  memory.delete(sourceRef);
  inflight.delete(sourceRef);
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(storageKey(sourceRef));
  } catch {
    // Ignore — memory cache is already cleared.
  }
}

/** Start loading applicants early (e.g. on job row click). Safe to call repeatedly. */
export function prefetchRecruiteeApplicants(sourceRef: string | null | undefined): void {
  if (!sourceRef) return;
  void loadRecruiteeApplicants(sourceRef).catch(() => {});
}

export async function loadRecruiteeApplicants(
  sourceRef: string,
  options?: { force?: boolean },
): Promise<RecruiteeApplicantsResponse> {
  if (!options?.force) {
    const cached = getCachedApplicants(sourceRef);
    if (cached) return cached;
    const pending = inflight.get(sourceRef);
    if (pending) return pending;
  } else {
    inflight.delete(sourceRef);
  }

  const promise = api.recruitee
    .applicants(sourceRef)
    .then((data) => {
      const entry = { data, fetchedAt: Date.now() };
      memory.set(sourceRef, entry);
      writeStorage(sourceRef, entry);
      inflight.delete(sourceRef);
      return data;
    })
    .catch((err) => {
      inflight.delete(sourceRef);
      throw err;
    });

  inflight.set(sourceRef, promise);
  return promise;
}
