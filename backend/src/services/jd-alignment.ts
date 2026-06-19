import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { anthropicUsage, openaiChatUsage } from '../lib/token-usage.js';
import type { TokenUsage } from './ai-usage.js';
import type { WorkspaceKeys } from './model-router.js';
import type { ProfileEducation, ProfileExperience } from './linkedin-discovery.js';
import type { SeniorityBand } from './seniority-match.js';

export interface JdAlignmentInput {
  jobTitle: string;
  jobDescription: string;
  seniorityBand?: SeniorityBand;
  profile: {
    name: string;
    title?: string | null;
    company?: string | null;
    location?: string | null;
    headline?: string | null;
    profileSummary: string;
    workExperience?: ProfileExperience[];
    education?: ProfileEducation[];
  };
  modelId: string;
}

export interface JdAlignmentResult {
  stars: 1 | 2 | 3 | 4 | 5;
  rationale: string;
}

const SYSTEM_PROMPT = `You evaluate how well a professional profile aligns with a job description.
Focus on work history, education, seniority, domain skills, and location when present.
Profile text may come from LinkedIn search excerpts (Exa) or structured work history — use whatever evidence is available.

Seniority matching (critical — apply before assigning 4–5 stars):
- Infer the target seniority band from job_title, target_seniority, and the job description (years required, IC vs leadership).
- Penalize seniority mismatches heavily even when domain skills match:
  • Overqualified (Principal, Director, VP, Group/Head-of for a mid-level or non-lead IC role): cap at 3 stars; usually 2–3.
  • Underqualified (junior/intern for a senior role): cap at 2 stars.
- 5 stars requires aligned seniority AND skills. Strong skills alone are NOT enough if the candidate is clearly too senior or too junior.
- State seniority mismatch explicitly in rationale when it lowers the score.

Return ONLY valid JSON with this schema:
{
  "stars": 1 | 2 | 3 | 4 | 5,
  "rationale": "2-3 concise sentences explaining the rating"
}

Rating scale:
1 = poor fit — major gaps vs the role (skills or seniority)
2 = weak fit — some overlap but important requirements or seniority missing
3 = partial fit — reasonable skill overlap but notable gaps or seniority mismatch
4 = strong fit — most requirements met at the right level, minor gaps only
5 = excellent fit — highly aligned experience, skills, AND seniority

Be realistic and evidence-based. Weight recent work experience most heavily. Do not inflate scores without support in the profile.`;

function buildUserMessage(input: JdAlignmentInput): string {
  const { profile, jobTitle, jobDescription, seniorityBand } = input;
  return JSON.stringify({
    job_title: jobTitle,
    job_description: jobDescription.slice(0, 12_000),
    target_seniority: seniorityBand?.level ?? null,
    avoid_titles_indicating_overqualification: seniorityBand?.exclude ?? [],
    candidate: {
      name: profile.name,
      title: profile.title ?? null,
      company: profile.company ?? null,
      location: profile.location ?? null,
      headline: profile.headline ?? null,
      work_experience: profile.workExperience ?? [],
      education: profile.education ?? [],
      profile_summary: profile.profileSummary.slice(0, 8_000),
    },
  });
}

function clampStars(value: unknown): 1 | 2 | 3 | 4 | 5 {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 2;
  return Math.max(1, Math.min(5, Math.round(n))) as 1 | 2 | 3 | 4 | 5;
}

function parseAlignmentOutput(raw: string): JdAlignmentResult {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON');
    const parsed = JSON.parse(jsonMatch[0]) as { stars?: unknown; rationale?: unknown };
    return {
      stars: clampStars(parsed.stars),
      rationale:
        typeof parsed.rationale === 'string' && parsed.rationale.trim()
          ? parsed.rationale.trim()
          : 'No rationale returned.',
    };
  } catch {
    return { stars: 2, rationale: 'Could not parse AI alignment response.' };
  }
}

export interface JdAlignmentResponse {
  result: JdAlignmentResult;
  usage: TokenUsage;
}

async function scoreClaude(input: JdAlignmentInput, apiKey: string): Promise<JdAlignmentResponse> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: input.modelId,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(input) }],
  });
  const raw = response.content[0].type === 'text' ? response.content[0].text : '';
  return {
    result: parseAlignmentOutput(raw),
    usage: anthropicUsage(input.modelId, response),
  };
}

async function scoreOpenAI(input: JdAlignmentInput, apiKey: string): Promise<JdAlignmentResponse> {
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
  return {
    result: parseAlignmentOutput(raw),
    usage: openaiChatUsage(input.modelId, response),
  };
}

export async function scoreJdAlignment(
  input: JdAlignmentInput,
  keys: WorkspaceKeys,
): Promise<JdAlignmentResponse> {
  if (input.modelId.startsWith('claude-')) {
    if (!keys.anthropic) throw new Error('Anthropic API key not configured');
    return scoreClaude(input, keys.anthropic);
  }
  if (input.modelId.startsWith('gpt-') || input.modelId.startsWith('o1') || input.modelId.startsWith('o3')) {
    if (!keys.openai) throw new Error('OpenAI API key not configured');
    return scoreOpenAI(input, keys.openai);
  }
  throw new Error(`Unsupported model: ${input.modelId}`);
}
