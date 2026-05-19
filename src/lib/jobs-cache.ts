/** Session cache for the jobs list — avoids full Recruitee sync on every navigation. */

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
