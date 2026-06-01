import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { WorkspaceKeys } from './model-router.js';
import type { ProfileEducation, ProfileExperience } from './linkedin-discovery.js';

export interface JdAlignmentInput {
  jobTitle: string;
  jobDescription: string;
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
Return ONLY valid JSON with this schema:
{
  "stars": 1 | 2 | 3 | 4 | 5,
  "rationale": "2-3 concise sentences explaining the rating"
}

Rating scale:
1 = poor fit — major gaps vs the role
2 = weak fit — some overlap but important requirements missing
3 = partial fit — reasonable overlap with notable gaps
4 = strong fit — most requirements met, minor gaps only
5 = excellent fit — highly aligned experience, skills, and seniority

Be realistic and evidence-based. Weight recent work experience most heavily. Do not inflate scores without support in the profile.`;

function buildUserMessage(input: JdAlignmentInput): string {
  const { profile, jobTitle, jobDescription } = input;
  return JSON.stringify({
    job_title: jobTitle,
    job_description: jobDescription.slice(0, 12_000),
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

async function scoreClaude(input: JdAlignmentInput, apiKey: string): Promise<JdAlignmentResult> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: input.modelId,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(input) }],
  });
  const raw = response.content[0].type === 'text' ? response.content[0].text : '';
  return parseAlignmentOutput(raw);
}

async function scoreOpenAI(input: JdAlignmentInput, apiKey: string): Promise<JdAlignmentResult> {
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
  return parseAlignmentOutput(raw);
}

export async function scoreJdAlignment(
  input: JdAlignmentInput,
  keys: WorkspaceKeys,
): Promise<JdAlignmentResult> {
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
