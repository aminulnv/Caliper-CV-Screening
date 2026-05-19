export type ScreeningProvider = 'claude' | 'openai';

export type ScreeningModelOption = {
  id: string;
  provider: ScreeningProvider;
  label: string;
};

export const SCREENING_MODELS: ScreeningModelOption[] = [
  { id: 'claude-sonnet-4-6', provider: 'claude', label: 'Claude Sonnet 4.6' },
  { id: 'claude-opus-4-7', provider: 'claude', label: 'Claude Opus 4.7' },
  { id: 'claude-haiku-4-5-20251001', provider: 'claude', label: 'Claude Haiku 4.5' },
  { id: 'gpt-4o', provider: 'openai', label: 'GPT-4o' },
  { id: 'gpt-4o-mini', provider: 'openai', label: 'GPT-4o mini' },
  { id: 'o3-mini', provider: 'openai', label: 'o3-mini' },
];

export const PROVIDER_LABELS: Record<ScreeningProvider, string> = {
  claude: 'Claude (Anthropic)',
  openai: 'OpenAI',
};

export function providerForModel(modelId: string): ScreeningProvider {
  return modelId.startsWith('claude-') ? 'claude' : 'openai';
}

export function modelsForProvider(provider: ScreeningProvider): ScreeningModelOption[] {
  return SCREENING_MODELS.filter((m) => m.provider === provider);
}

export function labelForModel(modelId: string): string {
  return SCREENING_MODELS.find((m) => m.id === modelId)?.label ?? modelId;
}

export function isProviderConfigured(
  provider: ScreeningProvider,
  settings: { has_anthropic_key?: boolean; has_openai_key?: boolean } | null,
): boolean {
  if (!settings) return false;
  return provider === 'claude' ? Boolean(settings.has_anthropic_key) : Boolean(settings.has_openai_key);
}

export function firstConfiguredModel(
  provider: ScreeningProvider,
  settings: { has_anthropic_key?: boolean; has_openai_key?: boolean; default_model?: string } | null,
): string | null {
  const pool = modelsForProvider(provider).filter(() => isProviderConfigured(provider, settings));
  if (pool.length === 0) return null;
  const preferred = settings?.default_model;
  if (preferred && pool.some((m) => m.id === preferred)) return preferred;
  return pool[0].id;
}

type SettingsKeys = { has_anthropic_key?: boolean; has_openai_key?: boolean } | null;

function hasKeyForModel(modelId: string, settings: SettingsKeys): boolean {
  return isProviderConfigured(providerForModel(modelId), settings);
}

/** Mirrors backend pickRunnableModel for UI hints before starting a run. */
export function resolveRunnableModel(
  preferred: string,
  allowedModels: string[] | undefined,
  settings: SettingsKeys,
): { modelId: string; substituted: boolean; error?: string } {
  const allowed = allowedModels?.length ? allowedModels : [preferred];
  const tryList = [...new Set([preferred, ...allowed])];
  for (const modelId of tryList) {
    if (hasKeyForModel(modelId, settings)) {
      return { modelId, substituted: modelId !== preferred };
    }
  }
  if (settings?.has_openai_key) {
    return { modelId: 'gpt-4o', substituted: true };
  }
  if (settings?.has_anthropic_key) {
    return { modelId: 'claude-sonnet-4-6', substituted: true };
  }
  const wantsClaude = tryList.some((m) => m.startsWith('claude-'));
  return {
    modelId: preferred,
    substituted: false,
    error: wantsClaude
      ? 'Add an Anthropic API key in Settings, or switch this job to GPT-4o.'
      : 'Add an OpenAI API key in Settings → AI provider.',
  };
}
