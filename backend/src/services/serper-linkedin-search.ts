/**
 * Find public LinkedIn profile URLs via Google search (Serper.dev).
 * Supports multiple API keys — tries the next when one runs out of quota.
 * https://serper.dev/api-keys
 */

const SERPER_SEARCH = 'https://google.serper.dev/search';

/** Comma-separated keys in SERPER_API_KEYS, or single SERPER_API_KEY (SERPAPI_* accepted as legacy alias). */
export function parseSerperApiKeys(): string[] {
  const multi = process.env.SERPER_API_KEYS?.trim() || process.env.SERPAPI_API_KEYS?.trim();
  if (multi) {
    return [...new Set(multi.split(',').map((k) => k.trim()).filter(Boolean))];
  }
  const single =
    process.env.SERPER_API_KEY?.trim() ||
    process.env.SERPAPI_API_KEY?.trim();
  return single ? [single] : [];
}

export class SerperQuotaError extends Error {
  constructor(
    message: string,
    readonly keyIndex: number,
  ) {
    super(message);
    this.name = 'SerperQuotaError';
  }
}

export class SerperQueryBlockedError extends Error {
  constructor(
    message: string,
    readonly keyIndex: number,
  ) {
    super(message);
    this.name = 'SerperQueryBlockedError';
  }
}

function isQuotaOrAccountLimit(status: number, errorMsg: string): boolean {
  if (status === 429) return true;
  const lower = errorMsg.toLowerCase();
  return (
    lower.includes('run out') ||
    lower.includes('quota') ||
    lower.includes('limit') ||
    lower.includes('throttl') ||
    lower.includes('insufficient') ||
    lower.includes('exceeded') ||
    lower.includes('credits')
  );
}

function isQueryPatternBlocked(status: number, errorMsg: string): boolean {
  const lower = errorMsg.toLowerCase();
  return status === 400 && lower.includes('query pattern not allowed');
}

function isLinkedInProfileHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./, '').toLowerCase();
  if (host === 'business.linkedin.com' || host.startsWith('business.')) return false;
  return /^(?:[a-z]{2}\.)?linkedin\.com$/.test(host);
}

export function isLinkedInProfileUrl(url: string): boolean {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    if (!isLinkedInProfileHost(parsed.hostname)) return false;
    // Personal profiles: linkedin.com/in/{slug} with optional locale suffix (/en)
    return /^\/in\/[^/?#]+(?:\/[a-z]{2})?\/?$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function normalizeLinkedInProfileUrl(url: string): string | null {
  if (!isLinkedInProfileUrl(url)) return null;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    parsed.search = '';
    parsed.hash = '';
    parsed.hostname = 'www.linkedin.com';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export interface LinkedInSearchHit {
  url: string;
  searchTitle?: string;
  snippet?: string;
  company?: string;
  location?: string;
  /** Parsed current role when available (e.g. from Exa highlights). */
  roleTitle?: string;
  /** Full Exa highlights + page text — used for AI JD alignment scoring. */
  profileText?: string;
}

async function searchWithSerperKey(
  apiKey: string,
  keyIndex: number,
  query: string,
  limit: number,
): Promise<LinkedInSearchHit[]> {
  const res = await fetch(SERPER_SEARCH, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: query,
      num: Math.min(Math.max(limit * 2, 10), 20),
    }),
  });

  const raw = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* non-JSON */
  }

  const errorMsg =
    typeof data.message === 'string'
      ? data.message
      : typeof data.error === 'string'
        ? data.error
        : raw.slice(0, 240);

  if (!res.ok) {
    if (isQueryPatternBlocked(res.status, errorMsg)) {
      throw new SerperQueryBlockedError(
        `Serper key #${keyIndex}: query not allowed on free plan (${query.slice(0, 80)}…)`,
        keyIndex,
      );
    }
    if (isQuotaOrAccountLimit(res.status, errorMsg)) {
      throw new SerperQuotaError(
        `Serper key #${keyIndex} quota exceeded: ${errorMsg}`,
        keyIndex,
      );
    }
    throw new Error(`Serper key #${keyIndex} failed (${res.status}): ${errorMsg}`);
  }

  const results = Array.isArray(data.organic) ? data.organic : [];
  const hits: LinkedInSearchHit[] = [];

  for (const row of results) {
    const entry = row as Record<string, unknown>;
    const link = typeof entry.link === 'string' ? entry.link : '';
    const normalized = normalizeLinkedInProfileUrl(link);
    if (!normalized) continue;
    hits.push({
      url: normalized,
      searchTitle: typeof entry.title === 'string' ? entry.title : undefined,
      snippet: typeof entry.snippet === 'string' ? entry.snippet : undefined,
    });
    if (hits.length >= limit) break;
  }

  const seen = new Set<string>();
  return hits.filter((h) => {
    if (seen.has(h.url)) return false;
    seen.add(h.url);
    return true;
  });
}

export interface LinkedInUrlSearchResult {
  hits: LinkedInSearchHit[];
  searchQuery: string;
  searchProvider: string;
}

export async function searchLinkedInProfileUrls(
  queries: string[],
  limit: number,
  options?: { fallbackQueries?: string[] },
): Promise<LinkedInUrlSearchResult> {
  const keys = parseSerperApiKeys();
  if (!keys.length) {
    throw new Error(
      'LinkedIn search is not configured. Add SERPER_API_KEY or SERPER_API_KEYS from https://serper.dev/api-keys to the backend environment.',
    );
  }

  const attemptErrors: string[] = [];
  let lastQuery = queries[0] ?? options?.fallbackQueries?.[0] ?? '';
  const collected: LinkedInSearchHit[] = [];
  const seenUrls = new Set<string>();
  let winningQuery = '';

  if (!queries.length && !options?.fallbackQueries?.length) {
    throw new Error(
      'No LinkedIn search queries were generated. Add a job title or location to the job description.',
    );
  }

  const addHits = (hits: LinkedInSearchHit[]) => {
    for (const hit of hits) {
      if (seenUrls.has(hit.url)) continue;
      seenUrls.add(hit.url);
      collected.push(hit);
      if (collected.length >= limit) return true;
    }
    return collected.length >= limit;
  };

  const runQueries = async (queryList: string[], keyIndex: number, key: string) => {
    for (const query of queryList) {
      lastQuery = query;
      try {
        const hits = await searchWithSerperKey(key, keyIndex, query, limit);
        if (hits.length > 0 && !winningQuery) winningQuery = query;

        if (addHits(hits)) return true;

        if (hits.length === 0) {
          attemptErrors.push(`Serper #${keyIndex}: "${query.slice(0, 60)}…" — no profile URLs in results`);
        }
      } catch (err) {
        if (err instanceof SerperQueryBlockedError) {
          attemptErrors.push(`Serper #${keyIndex}: query blocked on free plan — trying simpler query`);
          continue;
        }
        if (err instanceof SerperQuotaError) {
          attemptErrors.push(`Serper #${keyIndex}: quota exceeded — trying next key`);
          return 'quota';
        }
        const msg = err instanceof Error ? err.message : 'search failed';
        attemptErrors.push(`Serper #${keyIndex}: ${msg}`);
        if (msg.toLowerCase().includes('invalid') && msg.toLowerCase().includes('key')) {
          return 'invalid';
        }
      }
    }
    return false;
  };

  for (let i = 0; i < keys.length; i++) {
    const keyIndex = i + 1;

    const primaryDone = await runQueries(queries, keyIndex, keys[i]);
    if (primaryDone === true) {
      return {
        hits: collected.slice(0, limit),
        searchQuery: winningQuery,
        searchProvider: keys.length > 1 ? `serper#${keyIndex}` : 'serper',
      };
    }
    if (primaryDone === 'quota' || primaryDone === 'invalid') {
      if (collected.length >= limit) break;
      continue;
    }

    const fallback = options?.fallbackQueries ?? [];
    if (fallback.length > 0 && collected.length < limit) {
      const fallbackDone = await runQueries(fallback, keyIndex, keys[i]);
      if (fallbackDone === true) {
        return {
          hits: collected.slice(0, limit),
          searchQuery: winningQuery,
          searchProvider: keys.length > 1 ? `serper#${keyIndex}` : 'serper',
        };
      }
      if (fallbackDone === 'quota' || fallbackDone === 'invalid') {
        if (collected.length >= limit) break;
        continue;
      }
    }

    if (collected.length >= limit) break;
  }

  if (collected.length > 0) {
    return {
      hits: collected.slice(0, limit),
      searchQuery: winningQuery,
      searchProvider: 'serper',
    };
  }

  if (attemptErrors.some((e) => e.includes('no profile URLs'))) {
    throw new Error(
      `No LinkedIn profiles found. Last query: ${lastQuery}. Try adding location or skills to the job description.`,
    );
  }

  throw new Error(
    attemptErrors.length
      ? `All Serper keys failed:\n${attemptErrors.join('\n')}`
      : 'Serper search failed.',
  );
}
