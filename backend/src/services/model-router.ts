import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { Criterion, ScoringRequest, ScoringResult, CriterionResult, Confidence, CandidateStatus } from '../types/index.js';

const SYSTEM_PROMPT = `You are a structured CV evaluator for a recruitment platform.
Given a candidate CV and a job rubric, evaluate each criterion and return a JSON object.

Rules:
- Only extract quotes that exist verbatim (or near-verbatim) in the CV text.
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

const FLAG_HIT_PENALTY_PER_WEIGHT = 4;

/** Binary checklist: only explicit met === true counts as met. */
function isChecklistMet(result: RawCriterionResult): boolean {
  return result.met === true;
}

function pctRounded(met: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((met / total) * 100);
}

function buildFullCriterionResults(
  criteria: Criterion[],
  results: RawCriterionResult[],
): RawCriterionResult[] {
  const byId = new Map<string, RawCriterionResult>();
  for (const r of results) {
    if (r.criterion_id) byId.set(r.criterion_id, r);
  }
  return criteria.map((c) => {
    const existing = byId.get(c.id);
    if (existing) return existing;
    return {
      criterion_id: c.id,
      met: false,
      confidence: 'low',
      quote: null,
      inferred: false,
      notes: 'No evaluation returned for this criterion',
    };
  });
}

export interface ScoreBreakdown {
  base_score: number;
  must_penalty: number;
  flag_penalty: number;
  score: number;
  must_met: number;
  nice_met: number;
  flag_triggered: number;
  must_total: number;
  nice_total: number;
  flag_total: number;
  must_met_pct: number;
  nice_met_pct: number;
  criteria_met_pct: number;
  confidence: Confidence;
  status: CandidateStatus;
}

function computeScore(criteria: Criterion[], results: RawCriterionResult[]): ScoreBreakdown {
  const fullResults = buildFullCriterionResults(criteria, results);
  const resultFor = (id: string) => fullResults.find((r) => r.criterion_id === id)!;

  const mustCriteria = criteria.filter((c) => c.kind === 'must');
  const niceCriteria = criteria.filter((c) => c.kind === 'nice');
  const flagCriteria = criteria.filter((c) => c.kind === 'flag');

  let mustMet = 0;
  let niceMet = 0;
  let flagTriggered = 0;
  let flagPenalty = 0;
  let lowConfidenceCount = 0;
  const scorableCount = mustCriteria.length + niceCriteria.length;

  for (const criterion of criteria) {
    const result = resultFor(criterion.id);
    if (result.confidence === 'low') lowConfidenceCount++;
    const met = isChecklistMet(result);

    if (criterion.kind === 'flag') {
      if (met) {
        flagTriggered++;
        flagPenalty += criterion.weight * FLAG_HIT_PENALTY_PER_WEIGHT;
      }
      continue;
    }
    if (criterion.kind === 'must' && met) mustMet++;
    if (criterion.kind === 'nice' && met) niceMet++;
  }

  const mustTotal = mustCriteria.length;
  const niceTotal = niceCriteria.length;
  const flagTotal = flagCriteria.length;
  const criteriaMet = mustMet + niceMet;
  const criteriaMetPct = pctRounded(criteriaMet, scorableCount);
  const mustMetPct = pctRounded(mustMet, mustTotal);
  const niceMetPct = pctRounded(niceMet, niceTotal);

  const baseScore = criteriaMetPct;
  const score = Math.max(0, Math.min(100, baseScore - flagPenalty));

  const confidence: Confidence =
    lowConfidenceCount > scorableCount / 2 ? 'low' : lowConfidenceCount > 0 ? 'medium' : 'high';

  const status: CandidateStatus =
    flagTriggered > 0
      ? 'flagged'
      : criteriaMetPct >= 80 && mustTotal > 0 && mustMet === mustTotal
        ? 'strong'
        : criteriaMetPct >= 60
          ? 'promising'
          : 'review';

  return {
    base_score: baseScore,
    must_penalty: 0,
    flag_penalty: flagPenalty,
    score,
    must_met: mustMet,
    nice_met: niceMet,
    flag_triggered: flagTriggered,
    must_total: mustTotal,
    nice_total: niceTotal,
    flag_total: flagTotal,
    must_met_pct: mustMetPct,
    nice_met_pct: niceMetPct,
    criteria_met_pct: criteriaMetPct,
    confidence,
    status,
  };
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
  const breakdown = computeScore(req.criteria, parsed.criteria_results);

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
    must_penalty: breakdown.must_penalty,
    flag_penalty: breakdown.flag_penalty,
    parse_warning: parsed.parse_warning,
    criteria_results: parsed.criteria_results as CriterionResult[],
  };
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
  const breakdown = computeScore(req.criteria, parsed.criteria_results);

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
    must_penalty: breakdown.must_penalty,
    flag_penalty: breakdown.flag_penalty,
    parse_warning: parsed.parse_warning,
    criteria_results: parsed.criteria_results as CriterionResult[],
  };
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
