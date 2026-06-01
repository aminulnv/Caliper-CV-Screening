/**
 * LinkedIn related-profile discovery.
 *
 * Pipeline: JD → AI keywords → Exa or Serper search → list LinkedIn profile URLs
 * Optional: Nubela enrich + AI score when RELATED_PROFILES_AUTO_SCORE=true
 */

import type { WorkspaceKeys } from './model-router.js';
import {
  buildLinkedInSearchQueries,
  extractDiscoveryParams,
  resolveDiscoveryLocation,
  type DiscoverySearchParams,
} from './discovery-params.js';
import { searchLinkedInProfilesWithExa, exaApiKey } from './exa-linkedin-search.js';
import {
  headlineFromPageTitle,
  nameFromPageTitle,
  normalizeLocation,
  sanitizeCompany,
  sanitizeRoleTitle,
} from './linkedin-profile-parse.js';
import {
  applySearchCountry,
  locationScopeLabel,
  NeedsCountryError,
} from '../lib/search-location.js';
import {
  normalizeLinkedInProfileUrl,
  parseSerperApiKeys,
  searchLinkedInProfileUrls,
  type LinkedInSearchHit,
} from './serper-linkedin-search.js';

export { NeedsCountryError };

export interface ProfileExperience {
  title?: string;
  company?: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
}

export interface ProfileEducation {
  school?: string;
  degree?: string;
  field?: string;
}

export interface DiscoveredProfile {
  name: string;
  title?: string;
  company?: string;
  location?: string;
  linkedinUrl: string;
  headline?: string;
  profileSummary: string;
  workExperience: ProfileExperience[];
  education: ProfileEducation[];
}

export interface DiscoveryOptions {
  jobTitle: string;
  jobDescription: string;
  linkedinUrls?: string[];
  limit?: number;
  modelId?: string;
  keys?: WorkspaceKeys;
  /** User-selected country name, or `global` for worldwide search when JD has no location. */
  searchCountry?: string;
}

export interface DiscoveryResult {
  profiles: DiscoveredProfile[];
  searchQuery: string;
  urlsFound: number;
  searchProvider: string;
  locationQuery?: string;
  locationScope?: string | null;
}

const NUBELA_LINKEDIN = 'https://nubela.co/proxycurl/api/v2/linkedin';

function nubelaApiKey(): string | undefined {
  return process.env.NUBELA_API_KEY?.trim() || process.env.PROXYCURL_API_KEY?.trim();
}

function linkedInSlugFromUrl(url: string): string {
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  const segment = match?.[1] ?? 'profile';
  return segment.replace(/\/(en|nl|fr|de|es|it|pt)$/i, '');
}

function stripLinkedInIdSuffix(slug: string): string {
  return slug.replace(/-[0-9a-f]{6,}$/i, '');
}

function nameFromSlug(slug: string): string {
  const cleaned = stripLinkedInIdSuffix(slug);
  return cleaned.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function nameFromSerperTitle(title: string): string | undefined {
  return nameFromPageTitle(title);
}

function headlineFromSerperTitle(title: string): string | undefined {
  return headlineFromPageTitle(title);
}

function profileFromLinkedInUrl(
  url: string,
  hit?: Pick<LinkedInSearchHit, 'searchTitle' | 'snippet' | 'company' | 'location' | 'roleTitle'>,
): DiscoveredProfile {
  const slug = linkedInSlugFromUrl(url);
  const name = (hit?.searchTitle && nameFromSerperTitle(hit.searchTitle)) || nameFromSlug(slug);
  const headline =
    sanitizeRoleTitle(hit?.roleTitle) ??
    sanitizeRoleTitle(hit?.searchTitle ? headlineFromSerperTitle(hit.searchTitle) : undefined);
  const company = sanitizeCompany(hit?.company);
  const location = normalizeLocation(hit?.location);
  return {
    name,
    title: headline,
    company,
    location,
    headline,
    linkedinUrl: url,
    workExperience: [],
    education: [],
    profileSummary: hit?.snippet?.trim() || 'Found via LinkedIn search.',
  };
}

function parseExperiences(raw: unknown): ProfileExperience[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 8).map((exp) => {
    const e = exp as Record<string, unknown>;
    const company =
      typeof e.company === 'string'
        ? e.company
        : typeof (e.company as Record<string, unknown>)?.name === 'string'
          ? String((e.company as Record<string, unknown>).name)
          : undefined;
    const starts = e.starts_at as Record<string, unknown> | undefined;
    const ends = e.ends_at as Record<string, unknown> | undefined;
    const fmtDate = (d: Record<string, unknown> | undefined) => {
      if (!d) return undefined;
      const y = d.year;
      const m = d.month;
      if (typeof y === 'number') return typeof m === 'number' ? `${y}-${String(m).padStart(2, '0')}` : String(y);
      return undefined;
    };
    return {
      title: typeof e.title === 'string' ? e.title : undefined,
      company,
      description: typeof e.description === 'string' ? e.description : undefined,
      startsAt: fmtDate(starts),
      endsAt: fmtDate(ends),
    };
  });
}

function parseEducation(raw: unknown): ProfileEducation[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 6).map((edu) => {
    const e = edu as Record<string, unknown>;
    return {
      school: typeof e.school === 'string' ? e.school : undefined,
      degree: typeof e.degree_name === 'string' ? e.degree_name : undefined,
      field: typeof e.field_of_study === 'string' ? e.field_of_study : undefined,
    };
  });
}

function buildProfileSummary(
  data: Record<string, unknown>,
  workExperience: ProfileExperience[],
  education: ProfileEducation[],
): string {
  const sections: string[] = [];

  if (typeof data.summary === 'string' && data.summary.trim()) {
    sections.push(`Summary:\n${data.summary.trim()}`);
  }
  if (typeof data.headline === 'string' && data.headline.trim()) {
    sections.push(`Headline: ${data.headline.trim()}`);
  }

  if (workExperience.length) {
    sections.push(
      'Work experience:\n' +
        workExperience
          .map((exp) => {
            const dates = [exp.startsAt, exp.endsAt ?? 'present'].filter(Boolean).join(' – ');
            const line = [exp.title, exp.company].filter(Boolean).join(' at ');
            const body = [line, dates ? `(${dates})` : '', exp.description].filter(Boolean).join(' ');
            return `- ${body}`;
          })
          .join('\n'),
    );
  }

  if (education.length) {
    sections.push(
      'Education:\n' +
        education
          .map((edu) => {
            const line = [edu.degree, edu.field, edu.school].filter(Boolean).join(', ');
            return line ? `- ${line}` : '';
          })
          .filter(Boolean)
          .join('\n'),
    );
  }

  return sections.join('\n\n').slice(0, 12_000) || 'No profile summary available.';
}

function profileFromLinkedInData(data: Record<string, unknown>, url: string): DiscoveredProfile {
  const fullName = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
  const workExperience = parseExperiences(data.experiences);
  const education = parseEducation(data.education);
  const current = workExperience[0];

  const locationParts = [data.city, data.state, data.country_full_name ?? data.country].filter(
    (v) => typeof v === 'string' && v.trim(),
  ) as string[];

  return {
    name: fullName || 'Unknown',
    title: current?.title || (typeof data.headline === 'string' ? data.headline : undefined),
    company: current?.company,
    location: locationParts.length ? locationParts.join(', ') : undefined,
    linkedinUrl: url,
    headline: typeof data.headline === 'string' ? data.headline : undefined,
    workExperience,
    education,
    profileSummary: buildProfileSummary(data, workExperience, education),
  };
}

async function fetchLinkedInProfile(url: string, apiKey: string): Promise<DiscoveredProfile | null> {
  const endpoint = `${NUBELA_LINKEDIN}?url=${encodeURIComponent(url)}`;
  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Record<string, unknown>;
  return profileFromLinkedInData(data, url);
}

function mockProfiles(jobTitle: string, jobDescription: string, limit: number): DiscoveredProfile[] {
  const role = jobTitle.trim() || 'Target role';
  const snippet = jobDescription.replace(/\s+/g, ' ').slice(0, 120);
  const templates = [
    { name: 'Alex Morgan', title: `Senior ${role}`, company: 'Northbridge Talent', location: 'Amsterdam, NL' },
    { name: 'Priya Shah', title: role, company: 'ScaleUp Partners', location: 'Berlin, DE' },
    { name: 'Jonas Berg', title: `Lead ${role}`, company: 'Venture People', location: 'Stockholm, SE' },
    { name: 'Maya Chen', title: 'People Operations Manager', company: 'FinTech Collective', location: 'London, UK' },
    { name: 'Luca Romano', title: 'HR Business Partner', company: 'Global Retail Co', location: 'Milan, IT' },
    { name: 'Emma Walsh', title: 'Recruitment Coordinator', company: 'Agency One', location: 'Dublin, IE' },
    { name: 'Samir Khan', title: `Director, ${role}`, company: 'Enterprise SaaS', location: 'Remote, EU' },
    { name: 'Nina Petrov', title: 'Talent Acquisition Specialist', company: 'HealthTech Labs', location: 'Warsaw, PL' },
  ];

  return templates.slice(0, limit).map((t, i) => ({
    name: t.name,
    title: t.title,
    company: t.company,
    location: t.location,
    linkedinUrl: `https://www.linkedin.com/in/mock-${i + 1}-${role.toLowerCase().replace(/\W+/g, '-')}`,
    headline: `${t.title} · ${t.company}`,
    workExperience: [{ title: t.title, company: t.company, description: `Experience relevant to ${role}.` }],
    education: [{ school: 'State University', degree: 'B.A.', field: 'Business Administration' }],
    profileSummary: [
      `${t.name} is a ${t.title} with experience relevant to ${role}.`,
      snippet ? `Job context: ${snippet}…` : '',
      'Work experience includes structured hiring and cross-functional collaboration.',
    ]
      .filter(Boolean)
      .join(' '),
  }));
}

async function searchForProfiles(
  params: DiscoverySearchParams,
  limit: number,
): Promise<{ hits: LinkedInSearchHit[]; searchQuery: string; searchProvider: string }> {
  const pref = (process.env.LINKEDIN_SEARCH_PROVIDER ?? 'exa').toLowerCase();
  const hasExa = Boolean(exaApiKey());
  const hasSerper = parseSerperApiKeys().length > 0;
  const allowSerperFallback = process.env.LINKEDIN_SEARCH_SERPER_FALLBACK === 'true';

  const tryExa = (pref === 'exa' || pref === 'auto') && hasExa;

  if (tryExa && hasExa) {
    try {
      const result = await searchLinkedInProfilesWithExa(params, limit);
      return result;
    } catch (err) {
      if (!allowSerperFallback || !hasSerper) throw err;
      console.warn('[discovery] Exa search failed, Serper fallback enabled:', err instanceof Error ? err.message : err);
    }
  }

  if (!hasSerper) {
    throw new Error(
      tryExa && !hasExa
        ? 'LinkedIn search is not configured. Add EXA_API_KEY or SERPER_API_KEY to the backend environment.'
        : 'Serper is not configured. Add SERPER_API_KEY or SERPER_API_KEYS from https://serper.dev/api-keys.',
    );
  }

  const location = params.locationQuery?.trim() ?? '';
  const { primary, fallback } = buildLinkedInSearchQueries(params);
  const searchQueries = primary.length > 0 ? primary : fallback;
  return searchLinkedInProfileUrls(searchQueries, limit, {
    fallbackQueries: location && fallback.length > 0 ? fallback : undefined,
  });
}

async function discoverFromJobDescription(opts: DiscoveryOptions, limit: number): Promise<DiscoveryResult> {
  if (!opts.modelId || !opts.keys) {
    throw new Error('AI provider keys are required to derive search terms from the job description.');
  }

  const params: DiscoverySearchParams = await extractDiscoveryParams({
    jobTitle: opts.jobTitle,
    jobDescription: opts.jobDescription,
    modelId: opts.modelId,
    keys: opts.keys,
  });

  const resolvedLocation = resolveDiscoveryLocation(params.locationQuery, opts.jobDescription);

  if (!resolvedLocation?.trim() && !opts.searchCountry?.trim()) {
    throw new NeedsCountryError();
  }

  params.locationQuery = applySearchCountry(resolvedLocation, opts.searchCountry);
  const locationScope = locationScopeLabel(params.locationQuery, opts.searchCountry);

  const { hits, searchProvider, searchQuery } = await searchForProfiles(params, limit);

  if (hits.length === 0) {
    throw new Error(
      `No LinkedIn profiles found for search: ${searchQuery}. Try adding location or skills to the job description.`,
    );
  }

  const nubelaKey = nubelaApiKey();
  const profiles: DiscoveredProfile[] = [];

  for (const hit of hits) {
    if (nubelaKey) {
      const enriched = await fetchLinkedInProfile(hit.url, nubelaKey);
      if (enriched) {
        profiles.push(enriched);
        continue;
      }
    }
    profiles.push(profileFromLinkedInUrl(hit.url, hit));
  }

  return {
    profiles,
    searchQuery,
    urlsFound: hits.length,
    searchProvider,
    locationQuery: params.locationQuery,
    locationScope,
  };
}

export async function discoverSimilarProfiles(opts: DiscoveryOptions): Promise<DiscoveryResult> {
  const limit = Math.max(1, Math.min(opts.limit ?? 10, 25));
  const mode = (process.env.LINKEDIN_DISCOVERY_MODE ?? 'auto').toLowerCase();

  const manualUrls = [...new Set((opts.linkedinUrls ?? []).map(normalizeLinkedInProfileUrl).filter(Boolean))] as string[];

  if (manualUrls.length > 0) {
    const profiles = manualUrls.slice(0, limit).map((url) => profileFromLinkedInUrl(url));
    return { profiles, searchQuery: '(manual LinkedIn URLs)', urlsFound: manualUrls.length, searchProvider: 'manual' };
  }

  if (mode === 'mock') {
    return {
      profiles: mockProfiles(opts.jobTitle, opts.jobDescription, limit),
      searchQuery: '(mock mode)',
      urlsFound: limit,
      searchProvider: 'mock',
    };
  }

  return discoverFromJobDescription(opts, limit);
}
