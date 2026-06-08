/** Session cache for the jobs list — avoids full Recruitee sync on every navigation. */

import { api } from '@/services/api';

export const JOBS_SYNC_INTERVAL_MS = 15 * 60 * 1000;

const CACHE_KEY = 'caliper:jobs-cache:v1';

export type JobsCacheEntry = {
  /** Raw rows from GET /jobs (before shapeJobRow). */
  jobs: unknown[];
  fetchedAt: number;
  lastSyncAt: number | null;
  syncNote: string;
};

export function readJobsCache(): JobsCacheEntry | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
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

export function writeJobsCache(entry: JobsCacheEntry): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Quota exceeded or private mode — ignore.
  }
}

export function clearJobsCache(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(CACHE_KEY);
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

let inflight: Promise<JobsCacheEntry> | null = null;

async function fetchJobsEntry(forceSync: boolean): Promise<JobsCacheEntry> {
  const cache = readJobsCache();
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
  writeJobsCache(entry);
  return entry;
}

/** Load jobs (Recruitee sync + list). Dedupes concurrent calls; returns session cache when fresh. */
export async function loadJobs(options?: { forceSync?: boolean }): Promise<JobsCacheEntry> {
  const forceSync = Boolean(options?.forceSync);

  if (forceSync) {
    inflight = null;
  } else {
    const cache = readJobsCache();
    if (cache?.jobs?.length && !shouldRunRecruiteeSync(cache?.lastSyncAt ?? null, false)) {
      return cache;
    }
    if (inflight) return inflight;
  }

  const promise = fetchJobsEntry(forceSync).finally(() => {
    inflight = null;
  });
  inflight = promise;
  return promise;
}

/** Warm jobs data in the background (e.g. while the runs page is visible). */
export function prefetchJobs(options?: { forceSync?: boolean }): void {
  void loadJobs(options).catch(() => {});
}
