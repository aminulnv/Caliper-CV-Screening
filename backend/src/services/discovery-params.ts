import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { WorkspaceKeys } from './model-router.js';
import { inferSeniorityBand, mergeSeniorityBand } from './seniority-match.js';

export interface DiscoverySearchParams {
  roleTitle: string;
  keywords: string[];
  locationQuery?: string;
  seniorityLevel?: string;
  seniorityExclude?: string[];
}

export interface ExtractDiscoveryParamsInput {
  jobTitle: string;
  jobDescription: string;
  modelId: string;
  keys: WorkspaceKeys;
}

const SYSTEM_PROMPT = `You extract LinkedIn search parameters from a job description for finding candidate profiles on LinkedIn.
Return ONLY valid JSON with this schema:
{
  "role_title": "string — target job title as it appears on LinkedIn (include Senior/Lead/Director only if the JD is that level)",
  "keywords": ["string", ...], // 3-6 skill/domain/industry terms from the JD (not the role title repeated)
  "location_query": "string or null", // city/region/country; null if remote/unspecified
  "seniority_level": "string — target seniority band in plain English, e.g. mid-level individual contributor, senior IC, director level",
  "seniority_exclude": ["string", ...] // LinkedIn title words indicating OVERqualification, e.g. Principal, Director, VP when hiring a mid-level PM
}

Rules:
- role_title must match the level in the posting. Do NOT upgrade to Principal/Director/Senior unless the JD explicitly requires it.
- For a plain "Product Manager" or "Analyst" without Senior/Director/Principal in the title, assume mid-level IC — exclude Principal, Director, VP, Group, Head of from results.
- seniority_level: infer from title, years of experience required, grade/level fields, and leadership vs IC language.
- seniority_exclude: 3-6 terms that would indicate candidates too senior for this role (empty array only for executive searches).
- keywords: concrete skills, domains, tools — not seniority words already in role_title.
- location_query: only when the JD clearly states a location; do not invent one.
- For recruitment notices with a "Location:" field, use city + country only (e.g. "Dhaka Bangladesh"), not the full street address.
- Keep keywords short — they will be combined into a search query.`;

function buildUserMessage(input: ExtractDiscoveryParamsInput): string {
  return JSON.stringify({
    job_title: input.jobTitle,
    job_description: input.jobDescription.slice(0, 12_000),
  });
}

function parseKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((k) => (typeof k === 'string' ? k.trim() : '')).filter(Boolean))].slice(0, 6);
}

function parseDiscoveryParams(raw: string, jobTitle: string, jobDescription: string): DiscoverySearchParams {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON');
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const roleTitle =
      typeof parsed.role_title === 'string' && parsed.role_title.trim()
        ? parsed.role_title.trim()
        : jobTitle.trim() || 'Professional';

    const seniority = mergeSeniorityBand(
      typeof parsed.seniority_level === 'string' ? parsed.seniority_level : undefined,
      parsed.seniority_exclude,
      jobTitle,
      jobDescription,
    );

    return {
      roleTitle,
      keywords: parseKeywords(parsed.keywords),
      locationQuery:
        typeof parsed.location_query === 'string' && parsed.location_query.trim()
          ? parsed.location_query.trim()
          : undefined,
      seniorityLevel: seniority.level,
      seniorityExclude: seniority.exclude,
    };
  } catch {
    const fallback = inferSeniorityBand(jobTitle, jobDescription);
    return {
      roleTitle: jobTitle.trim() || 'Professional',
      keywords: [],
      seniorityLevel: fallback.level,
      seniorityExclude: fallback.exclude,
    };
  }
}

function normalizeSearchText(text: string): string {
  return text
    .replace(/\s*&\s*/g, ' and ')
    .replace(/[^\w\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Shorter / alternate titles — long or special-char titles often return job posts, not profiles. */
function roleSearchVariants(role: string): string[] {
  const trimmed = role.trim();
  const normalized = normalizeSearchText(trimmed);
  const variants = new Set<string>([trimmed, normalized]);

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length > 3) {
    variants.add(`${words[0]} ${words[words.length - 1]}`);
    variants.add(words.slice(-2).join(' '));
  }

  if (/risk/i.test(normalized)) {
    variants.add('Risk Analyst');
    variants.add('Operational Risk Analyst');
  }
  if (/recruit|talent acquisition|hr/i.test(normalized)) {
    variants.add('Recruiter');
    variants.add('Talent Acquisition Specialist');
  }

  return [...variants].filter((v) => v.length > 2);
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}

/** Pull city + country from a Location line or long address when AI omits location. */
export function extractLocationFromDescription(description: string): string | undefined {
  const text = stripHtml(description);

  const locLine = text.match(/\bLocation\s*:\s*([^\n\r]+)/i)?.[1]?.trim();
  const source = locLine ?? text;

  if (/\bdhaka\b/i.test(source) || /\bbangladesh\b/i.test(source)) {
    return 'Dhaka Bangladesh';
  }

  if (locLine) {
    const cityCountry = locLine.match(
      /^([A-Za-z][A-Za-z\s.-]{1,28})\s*,\s*(Bangladesh|India|Singapore|Malaysia|Cyprus|Netherlands|Germany|United Kingdom|UK|USA|United States|UAE|Dubai)\s*$/i,
    );
    if (cityCountry) {
      return `${cityCountry[1].trim()} ${cityCountry[2].replace(/^UK$/i, 'United Kingdom')}`;
    }
    if (/\bcyprus\b/i.test(locLine)) {
      const city = locLine.match(/^([A-Za-z][A-Za-z\s.-]+?)(?:,|\s)+Cyprus/i)?.[1]?.trim();
      return city ? `${city} Cyprus` : 'Cyprus';
    }
    if (locLine.length <= 50) return locLine;
  }

  const cityCountry = source.match(
    /\b([A-Za-z][A-Za-z\s.-]{2,28})\s*,?\s*(Bangladesh|India|Singapore|Malaysia|Cyprus|Netherlands|Germany|United Kingdom|UK|USA|United States|UAE)\b/i,
  );
  if (cityCountry) {
    return `${cityCountry[1].trim()} ${cityCountry[2].replace(/^UK$/i, 'United Kingdom')}`;
  }

  const cityPostal = source.match(/\b([A-Za-z][A-Za-z\s.-]{2,28})\s+\d{4,6}\b/);
  if (cityPostal) {
    const city = cityPostal[1].trim();
    if (/\bbangladesh\b/i.test(source)) return `${city} Bangladesh`;
    return city;
  }

  return undefined;
}

export function resolveDiscoveryLocation(
  aiLocation: string | undefined,
  jobDescription: string,
): string | undefined {
  const fromAi = aiLocation?.trim();
  if (fromAi) return fromAi;
  return extractLocationFromDescription(jobDescription);
}

export interface LinkedInSearchQueryPlan {
  /** Queries that include location — tried first when location is set. */
  primary: string[];
  /** Queries without location — only used if primary returns too few profiles. */
  fallback: string[];
}

export function buildLinkedInSearchQueries(params: DiscoverySearchParams): LinkedInSearchQueryPlan {
  const location = params.locationQuery?.trim() ?? '';
  const keywords = params.keywords.slice(0, 3);
  const topKeyword = keywords[0] ?? '';
  const primary: string[] = [];
  const fallback: string[] = [];

  for (const role of roleSearchVariants(params.roleTitle)) {
    primary.push([`"${role}"`, 'linkedin profile', topKeyword, location].filter(Boolean).join(' '));
    primary.push([`"${role}"`, 'linkedin.com/in', location].filter(Boolean).join(' '));
    primary.push([role, 'linkedin profile', topKeyword, location].filter(Boolean).join(' '));
  }

  if (topKeyword) {
    primary.push([`"${topKeyword}"`, 'linkedin profile', location].filter(Boolean).join(' '));
  }

  const simpleRole =
    roleSearchVariants(params.roleTitle).find((r) => r.split(/\s+/).length <= 3) ??
    normalizeSearchText(params.roleTitle);

  if (location) {
    primary.push([`"${simpleRole}"`, 'linkedin profile', location].filter(Boolean).join(' '));
    fallback.push(['site:linkedin.com/in', `"${simpleRole}"`, topKeyword].filter(Boolean).join(' '));
    fallback.push([`"${simpleRole}"`, 'linkedin profile', topKeyword].filter(Boolean).join(' '));
    fallback.push([simpleRole, 'linkedin profile', topKeyword].filter(Boolean).join(' '));
  } else {
    primary.push(['site:linkedin.com/in', `"${simpleRole}"`, topKeyword].filter(Boolean).join(' '));
  }

  const dedupe = (list: string[]) =>
    [...new Set(list.map((q) => q.replace(/\s+/g, ' ').trim()).filter((q) => q.length > 8))];

  return { primary: dedupe(primary), fallback: dedupe(fallback) };
}

/** Flat query list — all primary then fallback (legacy). */
export function buildLinkedInSearchQueryList(params: DiscoverySearchParams): string[] {
  const { primary, fallback } = buildLinkedInSearchQueries(params);
  return [...primary, ...fallback];
}

/** @deprecated Use buildLinkedInSearchQueryList */
export function buildLinkedInSearchQuery(params: DiscoverySearchParams): string {
  return buildLinkedInSearchQueryList(params)[0];
}

async function extractClaude(input: ExtractDiscoveryParamsInput, apiKey: string): Promise<DiscoverySearchParams> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: input.modelId,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(input) }],
  });
  const raw = response.content[0].type === 'text' ? response.content[0].text : '';
  return parseDiscoveryParams(raw, input.jobTitle, input.jobDescription);
}

async function extractOpenAI(input: ExtractDiscoveryParamsInput, apiKey: string): Promise<DiscoverySearchParams> {
  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: input.modelId,
    max_tokens: 512,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserMessage(input) },
    ],
  });
  const raw = response.choices[0]?.message?.content ?? '';
  return parseDiscoveryParams(raw, input.jobTitle, input.jobDescription);
}

export async function extractDiscoveryParams(
  input: ExtractDiscoveryParamsInput,
): Promise<DiscoverySearchParams> {
  if (input.modelId.startsWith('claude-')) {
    if (!input.keys.anthropic) throw new Error('Anthropic API key not configured');
    return extractClaude(input, input.keys.anthropic);
  }
  if (input.modelId.startsWith('gpt-') || input.modelId.startsWith('o1') || input.modelId.startsWith('o3')) {
    if (!input.keys.openai) throw new Error('OpenAI API key not configured');
    return extractOpenAI(input, input.keys.openai);
  }
  throw new Error(`Unsupported model: ${input.modelId}`);
}
