import type { WorkspaceKeys } from './model-router.js';

export function providerForModelId(modelId: string): 'anthropic' | 'openai' {
  if (modelId.startsWith('claude-')) return 'anthropic';
  return 'openai';
}

export function isModelKeyConfigured(modelId: string, keys: WorkspaceKeys): boolean {
  return providerForModelId(modelId) === 'anthropic' ? Boolean(keys.anthropic) : Boolean(keys.openai);
}

const OPENAI_FALLBACK = 'gpt-4o';
const CLAUDE_FALLBACK = 'claude-sonnet-4-6';

export type RunnableModelPick = {
  modelId: string;
  substituted: boolean;
  outsideAllowed: boolean;
};

/** Pick a model with a configured API key (preferred → allowed → provider default). */
export function pickRunnableModel(
  preferred: string,
  allowedModels: string[],
  keys: WorkspaceKeys,
): RunnableModelPick {
  const tryList = [...new Set([preferred, ...allowedModels])];
  for (const modelId of tryList) {
    if (isModelKeyConfigured(modelId, keys)) {
      return {
        modelId,
        substituted: modelId !== preferred,
        outsideAllowed: false,
      };
    }
  }

  if (keys.openai && isModelKeyConfigured(OPENAI_FALLBACK, keys)) {
    return {
      modelId: OPENAI_FALLBACK,
      substituted: true,
      outsideAllowed: !allowedModels.includes(OPENAI_FALLBACK),
    };
  }
  if (keys.anthropic && isModelKeyConfigured(CLAUDE_FALLBACK, keys)) {
    return {
      modelId: CLAUDE_FALLBACK,
      substituted: true,
      outsideAllowed: !allowedModels.includes(CLAUDE_FALLBACK),
    };
  }

  const wantsClaude = tryList.some((m) => m.startsWith('claude-'));
  const wantsOpenai = tryList.some((m) => m.startsWith('gpt-') || m.startsWith('o'));
  const parts: string[] = [];
  if (wantsClaude && !keys.anthropic) {
    parts.push(
      'add an Anthropic API key in Settings (for Claude), or switch this job to GPT-4o and enable it under allowed models',
    );
  }
  if (wantsOpenai && !keys.openai) {
    parts.push('add an OpenAI API key in Settings (for GPT models)');
  }
  const hint =
    parts.length > 0
      ? parts.join('; ')
      : 'configure an AI provider API key in Settings → AI provider';
  throw new Error(`AI screening is not configured: ${hint}.`);
}

export function mapCriterionRows(rows: Record<string, unknown>[]) {
  return rows.map((r) => ({
    id: String(r.id),
    job_id: String(r.jobId ?? r.job_id),
    kind: r.kind as 'must' | 'nice' | 'flag',
    name: String(r.name),
    weight: Number(r.weight ?? 1),
    biased: Boolean(r.biased),
  }));
}
