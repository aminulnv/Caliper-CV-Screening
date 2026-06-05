import type { RecruiteeApplicant } from '@/services/api';
import { api } from '@/services/api';

const APPLICANTS_TTL_MS = 10 * 60 * 1000;

type CacheEntry = {
  apps: RecruiteeApplicant[];
  fetchedAt: number;
};

const memory = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<RecruiteeApplicant[]>>();

function storageKey(sourceRef: string): string {
  return `caliper:applicants:v3:${sourceRef}`;
}

function readStorage(sourceRef: string): CacheEntry | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(storageKey(sourceRef));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed?.apps || !Array.isArray(parsed.apps) || typeof parsed.fetchedAt !== 'number') {
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
): RecruiteeApplicant[] | null {
  if (!sourceRef) return null;
  const mem = memory.get(sourceRef);
  if (mem && Date.now() - mem.fetchedAt <= APPLICANTS_TTL_MS) return mem.apps;
  const stored = readStorage(sourceRef);
  if (stored) {
    memory.set(sourceRef, stored);
    return stored.apps;
  }
  return null;
}

/** Start loading applicants early (e.g. on job row click). Safe to call repeatedly. */
export function prefetchRecruiteeApplicants(sourceRef: string | null | undefined): void {
  if (!sourceRef) return;
  void loadRecruiteeApplicants(sourceRef).catch(() => {});
}

export async function loadRecruiteeApplicants(
  sourceRef: string,
  options?: { force?: boolean },
): Promise<RecruiteeApplicant[]> {
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
    .then((apps) => {
      const entry = { apps, fetchedAt: Date.now() };
      memory.set(sourceRef, entry);
      writeStorage(sourceRef, entry);
      inflight.delete(sourceRef);
      return apps;
    })
    .catch((err) => {
      inflight.delete(sourceRef);
      throw err;
    });

  inflight.set(sourceRef, promise);
  return promise;
}
