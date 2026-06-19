/** USD per 1M tokens — approximate public list prices for cost estimation. */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'o3-mini': { input: 1.1, output: 4.4 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
};

const DEFAULT_PRICING = { input: 3, output: 15 };

/** Heuristic averages for pre-run screening estimates. */
const EST_SCREENING_INPUT_TOKENS_PER_CV = 4500;
const EST_SCREENING_OUTPUT_TOKENS_PER_CV = 900;

export function getModelPricing(modelId: string): { input: number; output: number } {
  return MODEL_PRICING[modelId] ?? DEFAULT_PRICING;
}

export function computeCostUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const { input, output } = getModelPricing(modelId);
  const cost = (inputTokens * input + outputTokens * output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function estimateScreeningCostUsd(
  modelId: string,
  cvCount: number,
  _criteriaCount: number,
): number {
  const inputTokens = cvCount * EST_SCREENING_INPUT_TOKENS_PER_CV;
  const outputTokens = cvCount * EST_SCREENING_OUTPUT_TOKENS_PER_CV;
  return computeCostUsd(modelId, inputTokens, outputTokens);
}

export function formatCostUsd(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}
