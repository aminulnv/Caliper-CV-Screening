import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { Criterion, ScoringRequest, ScoringResult, CriterionResult } from '../types/index.js';
import { anthropicUsage, openaiChatUsage } from '../lib/token-usage.js';
import type { TokenUsage } from './ai-usage.js';
import { computeScore } from './scoring.js';
import { analyzeCvQualityHeuristic, mergeCvQuality, type CvQualityAssessment } from './cv-quality.js';

const SYSTEM_PROMPT = `You are a senior recruiter reviewing CVs — not a keyword matcher.
Given a candidate CV and a job rubric, evaluate each criterion and assess overall CV quality like a human would before shortlisting.

Criterion rules:
- quote MUST be copied character-for-character from the CV text: one contiguous passage, no paraphrasing, no stitching parts together with "...", and never the criterion wording itself. If no contiguous passage supports the criterion, set quote to null and explain in notes instead.
- Set met to true ONLY when the CV shows substantive evidence (roles with context, achievements, completed work, credentials) — not when a keyword, skill tag, or generic bullet merely mentions the topic.
- Do NOT mark experience criteria met from skills lists alone, unrelated internships, or vague claims without dates or outcomes.
- A single internship, graduate profile, or template CV with buzzwords should NOT satisfy senior or multi-year experience requirements.
- Do NOT inflate scores for design-heavy template CVs with thin experience, generic buzzwords, or "About Me" fluff.
- Set inferred to true when met is true but evidence is not directly quoted in the CV.
- Red flags: met true means the concerning pattern was found.
- Be skeptical: ticking every box on a weak CV is a failure mode. Prefer met=false when evidence is shallow.
- Example: "content editing experience" is NOT met when the CV only lists "content writing" under Skills with no editing role, dates, or outcomes.
- Example: "3+ years experience" is NOT met for a candidate with one short internship.

CV quality (human read — presentation, depth, experience substance):
- presentation: layout clarity, professional polish, readable structure (infer from text flow even if PDF layout is lost). Penalize generic Canva/template layouts with list-heavy, low-substance content.
- depth: specificity, achievements, impact, detail — not just lists of soft skills. Penalize CVs with no quantified outcomes.
- experience: breadth, seniority, progression, relevance; penalize single internship / graduate CVs presented like seasoned profiles (overall should often be 35-55 for early-career thin CVs)
- overall: would you move this CV to the top of the pile on merit alone? Thin template CVs rarely score above 50.

Return ONLY valid JSON matching the schema — no explanation text outside JSON.`;

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
  cv_quality?: Partial<CvQualityAssessment> | null;
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
      summary: 'string (2-3 sentences — include CV quality impression for a recruiter)',
      parse_warning: 'string | null',
      cv_quality: {
        overall: 'number 0-100',
        presentation: 'number 0-100',
        depth: 'number 0-100',
        experience: 'number 0-100',
        notes: 'string[] (brief recruiter-style concerns, may be empty)',
      },
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
    quality_adjustment: breakdown.quality_adjustment,
    cv_quality_score: breakdown.cv_quality_score,
    parse_warning: parsed.parse_warning,
    criteria_results: parsed.criteria_results as CriterionResult[],
  };
}

function isExperienceCriterion(criterion: Criterion): boolean {
  const name = criterion.name.toLowerCase();
  return /experience|years?|prior|background|track record|proven|demonstrated/.test(name);
}

function demoteShallowMatches(
  results: RawCriterionResult[],
  criteria: Criterion[],
  quality: CvQualityAssessment,
): RawCriterionResult[] {
  if (quality.overall >= 58) return results;

  return results.map((result) => {
    const criterion = criteria.find((c) => c.id === result.criterion_id);
    if (!result.met || !criterion || criterion.kind === 'flag') return result;

    const quoteLen = result.quote?.trim().length ?? 0;
    const shallowEvidence = !result.quote?.trim() || result.inferred || quoteLen < 40;
    const thinProfile = quality.experience < 50 || quality.depth < 45;

    if (shallowEvidence && thinProfile && (isExperienceCriterion(criterion) || criterion.kind === 'must')) {
      return {
        ...result,
        met: false,
        confidence: 'low',
        notes: [result.notes, 'Insufficient depth — keyword or inferred match only.']
          .filter(Boolean)
          .join(' '),
      };
    }
    return result;
  });
}

function scoreFromParsed(
  parsed: RawScoringOutput,
  req: ScoringRequest,
): ScoringResult {
  const heuristicQuality = analyzeCvQualityHeuristic(req.cvText);
  const mergedQuality = mergeCvQuality(parsed.cv_quality, heuristicQuality);
  const adjustedResults = demoteShallowMatches(
    parsed.criteria_results,
    req.criteria,
    mergedQuality,
  );
  const breakdown = computeScore(
    req.criteria,
    adjustedResults,
    req.confidenceThreshold,
    mergedQuality,
  );

  let summary = parsed.summary;
  if (mergedQuality.overall < 58 && mergedQuality.notes.length > 0) {
    const note = mergedQuality.notes[0];
    if (note && !summary.toLowerCase().includes(note.toLowerCase().slice(0, 20))) {
      summary = `${summary.trim()} CV quality: ${note}.`;
    }
  }

  return toScoringResult({ ...parsed, summary, criteria_results: adjustedResults }, breakdown);
}

export interface ScoringResponse {
  result: ScoringResult;
  usage: TokenUsage;
}

async function scoreClaude(req: ScoringRequest, apiKey: string): Promise<ScoringResponse> {
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
  const result = scoreFromParsed(parsed, req);

  return {
    result,
    usage: anthropicUsage(req.modelId, response),
  };
}

async function scoreOpenAI(req: ScoringRequest, apiKey: string): Promise<ScoringResponse> {
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
  const result = scoreFromParsed(parsed, req);

  return {
    result,
    usage: openaiChatUsage(req.modelId, response),
  };
}

export interface WorkspaceKeys {
  anthropic?: string;
  openai?: string;
}

export async function scoreCV(req: ScoringRequest, keys: WorkspaceKeys): Promise<ScoringResponse> {
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
