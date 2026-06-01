/**
 * LinkedIn people discovery via Exa (semantic search).
 * https://docs.exa.ai/reference/search-api-guide-for-coding-agents
 */

import type { DiscoverySearchParams } from './discovery-params.js';
import {
  buildProfileSnippet,
  extractRoleCompanyFromText,
  headlineFromPageTitle,
  mergeRoleCompany,
  normalizeLocation,
  parseLocationFromText,
  parseTitleAtCompany,
  sanitizeCompany,
  sanitizeRoleTitle,
} from './linkedin-profile-parse.js';
import {
  normalizeLinkedInProfileUrl,
  type LinkedInSearchHit,
  type LinkedInUrlSearchResult,
} from './serper-linkedin-search.js';

const EXA_SEARCH = 'https://api.exa.ai/search';

export function exaApiKey(): string | undefined {
  return process.env.EXA_API_KEY?.trim();
}

/** Natural-language query for Exa people search (not Google keyword syntax). */
export function buildExaPeopleSearchQuery(params: DiscoverySearchParams): string {
  const role = params.roleTitle.trim();
  const skills = params.keywords.slice(0, 4).filter(Boolean);
  const location = params.locationQuery?.trim();

  const parts: string[] = [`${role} professionals`];
  if (skills.length) parts.push(`with experience in ${skills.join(', ')}`);
  if (location) parts.push(`in ${location}`);
  parts.push('on LinkedIn');

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function snippetFromHighlights(highlights: unknown): string | undefined {
  if (!Array.isArray(highlights)) return undefined;
  const text = highlights
    .map((h) => (typeof h === 'string' ? h : ''))
    .filter(Boolean)
    .join(' ')
    .trim();
  return text || undefined;
}

function personFromEntity(entities: unknown): Partial<LinkedInSearchHit> {
  if (!Array.isArray(entities)) return {};
  for (const raw of entities) {
    const entity = raw as Record<string, unknown>;
    if (entity.type !== 'person') continue;
    const props = entity.properties as Record<string, unknown> | undefined;
    if (!props) continue;
    const name = typeof props.name === 'string' ? props.name : undefined;
    const title =
      typeof props.title === 'string'
        ? props.title
        : typeof props.headline === 'string'
          ? props.headline
          : undefined;
    const company =
      typeof props.company === 'string'
        ? props.company
        : typeof (props.company as Record<string, unknown>)?.name === 'string'
          ? String((props.company as Record<string, unknown>).name)
          : undefined;
    const location =
      typeof props.location === 'string'
        ? props.location
        : typeof props.locationName === 'string'
          ? props.locationName
          : undefined;
    return {
      searchTitle: name && title ? `${name} - ${title}` : name ?? title,
      roleTitle: sanitizeRoleTitle(title),
      company: sanitizeCompany(company),
      location: normalizeLocation(location),
    };
  }
  return {};
}

function mapExaResult(row: Record<string, unknown>): LinkedInSearchHit | null {
  const link = typeof row.url === 'string' ? row.url : '';
  const normalized = normalizeLinkedInProfileUrl(link);
  if (!normalized) return null;

  const pageTitle = typeof row.title === 'string' ? row.title : undefined;
  const highlightSnippet = snippetFromHighlights(row.highlights);
  const textSnippet = typeof row.text === 'string' ? row.text.slice(0, 4000) : undefined;
  const combinedText = [highlightSnippet, textSnippet].filter(Boolean).join('\n');

  const entityFields = personFromEntity(row.entities);
  const pageHeadline = pageTitle ? headlineFromPageTitle(pageTitle) : undefined;
  const fromPageTitle = pageHeadline ? parseTitleAtCompany(pageHeadline) : {};
  const fromHighlights = extractRoleCompanyFromText(combinedText);

  const merged = mergeRoleCompany(
    { role: fromHighlights.role, company: fromHighlights.company, score: 100 },
    { role: fromPageTitle.role, company: fromPageTitle.company, score: 90 },
    { role: entityFields.roleTitle, company: entityFields.company, score: 70 },
    { role: pageHeadline, company: undefined, score: 40 },
  );

  const roleTitle = merged.role;
  const company = merged.company;
  const location = normalizeLocation(
    entityFields.location ?? parseLocationFromText(combinedText) ?? parseLocationFromText(pageTitle ?? ''),
  );

  return {
    url: normalized,
    searchTitle: pageTitle ?? entityFields.searchTitle,
    roleTitle,
    snippet: buildProfileSnippet(combinedText, { role: roleTitle, company, location }),
    company,
    location,
  };
}

export async function searchLinkedInProfilesWithExa(
  params: DiscoverySearchParams,
  limit: number,
): Promise<LinkedInUrlSearchResult> {
  const apiKey = exaApiKey();
  if (!apiKey) {
    throw new Error('EXA_API_KEY is not configured. Add it to the backend environment.');
  }

  const query = buildExaPeopleSearchQuery(params);
  const numResults = Math.max(1, Math.min(limit, 25));

  const res = await fetch(EXA_SEARCH, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      type: 'auto',
      category: 'people',
      includeDomains: ['linkedin.com'],
      numResults,
      contents: {
        highlights: { numSentences: 4, highlightsPerUrl: 4 },
        text: { maxCharacters: 2000 },
      },
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
    throw new Error(`Exa search failed (${res.status}): ${errorMsg}`);
  }

  const results = Array.isArray(data.results) ? data.results : [];
  const hits: LinkedInSearchHit[] = [];
  const seen = new Set<string>();

  for (const row of results) {
    const hit = mapExaResult(row as Record<string, unknown>);
    if (!hit || seen.has(hit.url)) continue;
    seen.add(hit.url);
    hits.push(hit);
  }

  if (hits.length === 0) {
    throw new Error(
      `No LinkedIn profiles found via Exa for: ${query}. Try refining the job description or location.`,
    );
  }

  return {
    hits,
    searchQuery: query,
    searchProvider: 'exa',
  };
}
