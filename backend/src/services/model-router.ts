import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { Criterion, ScoringRequest, ScoringResult, CriterionResult } from '../types/index.js';
import { computeScore } from './scoring.js';

const SYSTEM_PROMPT = `You are a structured CV evaluator for a recruitment platform.
Given a candidate CV and a job rubric, evaluate each criterion and return a JSON object.

Rules:
- quote MUST be copied character-for-character from the CV text: one contiguous passage, no paraphrasing, no stitching parts together with "...", and never the criterion wording itself. If no contiguous passage supports the criterion, set quote to null and explain in notes instead.
- For each criterion set met to true or false only (binary checklist). Use false when not met or not evidenced in the CV.
- Do not fabricate evidence or make up qualifications.
- Set inferred to true when met is true but evidence is not directly quoted in the CV.
- Red flags: met true means the concerning pattern was found.
- Return ONLY valid JSON matching the schema — no explanation text.`;

interface RawCriterionResult {
  criterion_id: string;
  met: boolean | null;
  confidence: string;
  quote: string | null;
  inferred: boolean;
  notes: string | null;
}

interface RawScoringOutput {
  summary: string;
  parse_warning: string | null;
  criteria_results: RawCriterionResult[];
}

function buildUserMessage(cvText: string, criteria: Criterion[], candidateName?: string): string {
  const criteriaJson = JSON.stringify(
    criteria.map((c) => ({ id: c.id, kind: c.kind, name: c.name, weight: c.weight }))
  );
  return JSON.stringify({
    candidate_name: candidateName ?? 'Unknown',
    cv_text: cvText,
    criteria: JSON.parse(criteriaJson),
    output_schema: {
      summary: 'string (2-3 sentence candidate summary)',
      parse_warning: 'string | null',
      criteria_results: [
        {
          criterion_id: 'string',
          met: 'boolean (true = met, false = not met)',
          confidence: '"high" | "medium" | "low"',
          quote: 'string | null',
          inferred: 'boolean',
          notes: 'string | null',
        },
      ],
    },
  });
}

function parseModelOutput(raw: string, criteria: Criterion[]): RawScoringOutput {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    return JSON.parse(jsonMatch[0]) as RawScoringOutput;
  } catch {
    return {
      summary: 'Could not parse AI response.',
      parse_warning: 'AI output malformed',
      criteria_results: criteria.map((c) => ({
        criterion_id: c.id,
        met: false,
        confidence: 'low',
        quote: null,
        inferred: false,
        notes: 'Evaluation failed',
      })),
    };
  }
}

function toScoringResult(
  parsed: RawScoringOutput,
  breakdown: ReturnType<typeof computeScore>,
): ScoringResult {
  return {
    score: breakdown.score,
    confidence: breakdown.confidence,
    status: breakdown.status,
    summary: parsed.summary,
    must_met: breakdown.must_met,
    nice_met: breakdown.nice_met,
    flag_triggered: breakdown.flag_triggered,
    must_total: breakdown.must_total,
    nice_total: breakdown.nice_total,
    flag_total: breakdown.flag_total,
    must_met_pct: breakdown.must_met_pct,
    nice_met_pct: breakdown.nice_met_pct,
    criteria_met_pct: breakdown.criteria_met_pct,
    base_score: breakdown.base_score,
    flag_penalty: breakdown.flag_penalty,
    parse_warning: parsed.parse_warning,
    criteria_results: parsed.criteria_results as CriterionResult[],
  };
}

async function scoreClaude(req: ScoringRequest, apiKey: string): Promise<ScoringResult> {
  const client = new Anthropic({ apiKey });
  const userMsg = buildUserMessage(req.cvText, req.criteria, req.candidateName);

  const response = await client.messages.create({
    model: req.modelId,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMsg }],
  });

  const rawText = response.content[0].type === 'text' ? response.content[0].text : '';
  const parsed = parseModelOutput(rawText, req.criteria);
  const breakdown = computeScore(req.criteria, parsed.criteria_results, req.confidenceThreshold);

  return toScoringResult(parsed, breakdown);
}

async function scoreOpenAI(req: ScoringRequest, apiKey: string): Promise<ScoringResult> {
  const client = new OpenAI({ apiKey });
  const userMsg = buildUserMessage(req.cvText, req.criteria, req.candidateName);

  const response = await client.chat.completions.create({
    model: req.modelId,
    max_tokens: 2048,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ],
  });

  const rawText = response.choices[0]?.message?.content ?? '';
  const parsed = parseModelOutput(rawText, req.criteria);
  const breakdown = computeScore(req.criteria, parsed.criteria_results, req.confidenceThreshold);

  return toScoringResult(parsed, breakdown);
}

export interface WorkspaceKeys {
  anthropic?: string;
  openai?: string;
}

export async function scoreCV(req: ScoringRequest, keys: WorkspaceKeys): Promise<ScoringResult> {
  if (req.modelId.startsWith('claude-')) {
    if (!keys.anthropic) throw new Error('Anthropic API key not configured for this workspace');
    return scoreClaude(req, keys.anthropic);
  }
  if (req.modelId.startsWith('gpt-') || req.modelId.startsWith('o1') || req.modelId.startsWith('o3')) {
    if (!keys.openai) throw new Error('OpenAI API key not configured for this workspace');
    return scoreOpenAI(req, keys.openai);
  }
  throw new Error(`Unsupported model: ${req.modelId}`);
}

export { computeScore } from './scoring.js';
