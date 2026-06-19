import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { getProtectedAttributeError } from './criteria-validation.js';
import { anthropicUsage, openaiChatUsage } from '../lib/token-usage.js';
import type { TokenUsage } from './ai-usage.js';
import type { WorkspaceKeys } from './model-router.js';

export type GeneratedCriterion = {
  name: string;
  weight: number;
};

export type GeneratedCriteriaResult = {
  must_have: GeneratedCriterion[];
  nice_to_have: GeneratedCriterion[];
  red_flags: GeneratedCriterion[];
  skipped_count: number;
};

const SYSTEM_PROMPT = `You create structured screening rubrics from job descriptions for recruiters evaluating CVs.

Rules:
- must_have: hard requirements (skills, experience, certifications, location constraints if essential)
- nice_to_have: desirable but not mandatory qualifications
- red_flags: objective disqualifiers (e.g. missing license, wrong domain) — NOT demographic or protected traits
- NEVER include criteria about age, gender, race, religion, nationality, disability, marital status, pregnancy, or similar protected characteristics
- Avoid bias-prone wording (employment gaps, "young", "old") unless truly job-critical and phrased as job-relevant facts
- Each criterion is one clear, testable checklist line (max ~120 characters)
- weight: integer 1–5 (5 = most important within that category)
- Return 4–8 must_have, 3–6 nice_to_have, 2–4 red_flags when the JD supports it; fewer is OK for thin JDs
- Return ONLY valid JSON matching the schema — no markdown or explanation`;

interface RawOutput {
  must_have?: Array<{ name?: string; weight?: number }>;
  nice_to_have?: Array<{ name?: string; weight?: number }>;
  red_flags?: Array<{ name?: string; weight?: number }>;
}

function clampWeight(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(5, Math.round(n)));
}

function normalizeList(
  items: Array<{ name?: string; weight?: number }> | undefined,
): { accepted: GeneratedCriterion[]; skipped: number } {
  const accepted: GeneratedCriterion[] = [];
  let skipped = 0;
  for (const item of items ?? []) {
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) {
      skipped++;
      continue;
    }
    if (getProtectedAttributeError(name)) {
      skipped++;
      continue;
    }
    accepted.push({ name, weight: clampWeight(item.weight) });
  }
  return { accepted, skipped };
}

function parseOutput(raw: string): RawOutput {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI did not return valid JSON');
  return JSON.parse(jsonMatch[0]) as RawOutput;
}

function buildUserMessage(jobTitle: string, jobDescription: string): string {
  return JSON.stringify({
    job_title: jobTitle,
    job_description: jobDescription.slice(0, 14_000),
    output_schema: {
      must_have: [{ name: 'string', weight: '1-5' }],
      nice_to_have: [{ name: 'string', weight: '1-5' }],
      red_flags: [{ name: 'string', weight: '1-5' }],
    },
  });
}

export type GeneratedCriteriaResponse = {
  result: GeneratedCriteriaResult;
  usage: TokenUsage;
};

async function generateClaude(
  jobTitle: string,
  jobDescription: string,
  modelId: string,
  apiKey: string,
): Promise<GeneratedCriteriaResponse> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: modelId,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(jobTitle, jobDescription) }],
  });
  const raw = response.content[0].type === 'text' ? response.content[0].text : '';
  return {
    result: finalizeResult(parseOutput(raw)),
    usage: anthropicUsage(modelId, response),
  };
}

async function generateOpenAI(
  jobTitle: string,
  jobDescription: string,
  modelId: string,
  apiKey: string,
): Promise<GeneratedCriteriaResponse> {
  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: modelId,
    max_tokens: 2048,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserMessage(jobTitle, jobDescription) },
    ],
  });
  const raw = response.choices[0]?.message?.content ?? '';
  return {
    result: finalizeResult(parseOutput(raw)),
    usage: openaiChatUsage(modelId, response),
  };
}

function finalizeResult(parsed: RawOutput): GeneratedCriteriaResult {
  const must = normalizeList(parsed.must_have);
  const nice = normalizeList(parsed.nice_to_have);
  const flags = normalizeList(parsed.red_flags);
  const total = must.accepted.length + nice.accepted.length + flags.accepted.length;
  if (total === 0) {
    throw new Error('AI returned no usable criteria. Add a fuller job description and try again.');
  }
  return {
    must_have: must.accepted,
    nice_to_have: nice.accepted,
    red_flags: flags.accepted,
    skipped_count: must.skipped + nice.skipped + flags.skipped,
  };
}

export async function generateCriteriaFromJobDescription(
  jobTitle: string,
  jobDescription: string,
  modelId: string,
  keys: WorkspaceKeys,
): Promise<GeneratedCriteriaResponse> {
  const title = jobTitle.trim() || 'Role';
  const description = jobDescription.trim();
  if (description.length < 80) {
    throw new Error('Job description is too short. Paste the full JD on the Overview tab first.');
  }

  if (modelId.startsWith('claude-')) {
    if (!keys.anthropic) throw new Error('Anthropic API key not configured for this workspace');
    return generateClaude(title, description, modelId, keys.anthropic);
  }
  if (modelId.startsWith('gpt-') || modelId.startsWith('o1') || modelId.startsWith('o3')) {
    if (!keys.openai) throw new Error('OpenAI API key not configured for this workspace');
    return generateOpenAI(title, description, modelId, keys.openai);
  }
  throw new Error(`Unsupported model: ${modelId}`);
}

export function isPlaceholderJobDescription(description: string): boolean {
  const t = description.trim();
  if (!t) return true;
  return (
    t.startsWith('Synced from Recruitee')
    || t.startsWith('Imported from Recruitee')
  ) && t.length < 400;
}
