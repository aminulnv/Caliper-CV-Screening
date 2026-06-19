import type { TokenUsage } from '../services/ai-usage.js';

export function anthropicUsage(model: string, response: {
  usage?: { input_tokens?: number; output_tokens?: number };
}): TokenUsage {
  return {
    model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
}

export function openaiChatUsage(model: string, response: {
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}): TokenUsage {
  return {
    model,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  };
}

export function openaiEmbeddingUsage(model: string, response: {
  usage?: { prompt_tokens?: number; total_tokens?: number };
}): TokenUsage {
  const tokens = response.usage?.prompt_tokens ?? response.usage?.total_tokens ?? 0;
  return {
    model,
    inputTokens: tokens,
    outputTokens: 0,
  };
}
