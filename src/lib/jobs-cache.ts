/** Session cache for the jobs list — throttles Recruitee sync; jobs list always refetched from API. */

import { api } from '@/services/api';

export const JOBS_SYNC_INTERVAL_MS = 15 * 60 * 1000;

const CACHE_KEY_PREFIX = 'caliper:jobs-cache:v2';
const LEGACY_CACHE_KEY = 'caliper:jobs-cache:v1';

export type JobsCacheEntry = {
  /** Raw rows from GET /jobs (before shapeJobRow). */
  jobs: unknown[];
  fetchedAt: number;
  lastSyncAt: number | null;
  syncNote: string;
};

function jobsCacheKey(userId: string | null | undefined): string {
  return userId ? `${CACHE_KEY_PREFIX}:${userId}` : `${CACHE_KEY_PREFIX}:anonymous`;
}

export function readJobsCache(userId?: string | null): JobsCacheEntry | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    sessionStorage.removeItem(LEGACY_CACHE_KEY);
    const raw = sessionStorage.getItem(jobsCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as JobsCacheEntry;
    if (!parsed?.jobs || !Array.isArray(parsed.jobs) || typeof parsed.fetchedAt !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeJobsCache(entry: JobsCacheEntry, userId?: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(jobsCacheKey(userId), JSON.stringify(entry));
  } catch {
    // Quota exceeded or private mode — ignore.
  }
}

export function clearJobsCache(userId?: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(LEGACY_CACHE_KEY);
    if (userId) {
      sessionStorage.removeItem(jobsCacheKey(userId));
    }
  } catch {
    // ignore
  }
}

export function shouldRunRecruiteeSync(lastSyncAt: number | null, force = false): boolean {
  if (force) return true;
  if (lastSyncAt == null) return true;
  return Date.now() - lastSyncAt > JOBS_SYNC_INTERVAL_MS;
}

export function formatSyncNote(sync: {
  total: number;
  created: number;
  updated: number;
}): string {
  if (sync.total <= 0) return '';
  const parts = [`${sync.total} roles from Recruitee`];
  if (sync.created > 0) parts.push(`${sync.created} new`);
  if (sync.updated > 0) parts.push(`${sync.updated} updated`);
  return parts.join(' · ');
}

const inflightByUser = new Map<string, Promise<JobsCacheEntry>>();

async function fetchJobsEntry(
  forceSync: boolean,
  userId: string | null | undefined,
): Promise<JobsCacheEntry> {
  const cache = readJobsCache(userId);
  const runSync = shouldRunRecruiteeSync(cache?.lastSyncAt ?? null, forceSync);
  let syncNote = cache?.syncNote ?? '';
  let lastSyncAt = cache?.lastSyncAt ?? null;

  if (runSync) {
    try {
      const sync = await api.recruitee.syncJobs();
      syncNote = formatSyncNote(sync);
      lastSyncAt = Date.now();
    } catch {
      /* keep prior syncNote from cache */
    }
  }

  const jobs = await api.jobs.list();
  const entry: JobsCacheEntry = {
    jobs,
    fetchedAt: Date.now(),
    lastSyncAt: runSync ? lastSyncAt : cache?.lastSyncAt ?? lastSyncAt,
    syncNote,
  };
  writeJobsCache(entry, userId);
  return entry;
}

/** Load jobs (optional Recruitee sync + always GET /jobs). Dedupes concurrent calls per user. */
export async function loadJobs(options?: {
  forceSync?: boolean;
  userId?: string | null;
}): Promise<JobsCacheEntry> {
  const forceSync = Boolean(options?.forceSync);
  const userId = options?.userId ?? null;
  const inflightKey = userId ?? '__anon__';

  if (forceSync) {
    inflightByUser.delete(inflightKey);
  } else {
    const pending = inflightByUser.get(inflightKey);
    if (pending) return pending;
  }

  const promise = fetchJobsEntry(forceSync, userId).finally(() => {
    inflightByUser.delete(inflightKey);
  });
  inflightByUser.set(inflightKey, promise);
  return promise;
}

/** Warm jobs data in the background (e.g. while the runs page is visible). */
export function prefetchJobs(options?: { forceSync?: boolean; userId?: string | null }): void {
  void loadJobs(options).catch(() => {});
}
