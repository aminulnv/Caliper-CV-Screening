import { sql } from './db.js';
import { decryptKey } from './key-manager.js';
import type { WorkspaceKeys } from './model-router.js';
import type { WorkspaceSettings } from '../types/index.js';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_ALLOWED_MODELS = [DEFAULT_MODEL];

/** postgres.js camelCase transform — map row to API snake_case shape. */
export function mapWorkspaceSettingsRow(row: Record<string, unknown>): WorkspaceSettings {
  return {
    workspace_id: String(row.workspaceId ?? row.workspace_id),
    default_model: (row.defaultModel ?? row.default_model ?? DEFAULT_MODEL) as string,
    allowed_models: normalizeModelList(row.allowedModels ?? row.allowed_models),
    recruitee_base_url: (row.recruiteeBaseUrl ?? row.recruitee_base_url ?? null) as string | null,
    confidence_threshold: Number(row.confidenceThreshold ?? row.confidence_threshold ?? 60),
  };
}

function normalizeModelList(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed as string[];
    } catch {
      /* single model id stored as plain string */
    }
    return value ? [value] : [...DEFAULT_ALLOWED_MODELS];
  }
  return [...DEFAULT_ALLOWED_MODELS];
}

export async function getWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettings> {
  const [row] = await sql`
    SELECT workspace_id, default_model, allowed_models, recruitee_base_url, confidence_threshold
    FROM workspace_settings
    WHERE workspace_id = ${workspaceId}
  `;
  if (!row) throw new Error('Workspace settings not found');
  return mapWorkspaceSettingsRow(row as Record<string, unknown>);
}

export async function getWorkspaceKeys(workspaceId: string): Promise<WorkspaceKeys> {
  const [row] = await sql`
    SELECT anthropic_key_enc, openai_key_enc
    FROM workspace_settings
    WHERE workspace_id = ${workspaceId}
  `;
  if (!row) throw new Error('Workspace settings not found');
  return {
    anthropic: row.anthropicKeyEnc ? decryptKey(row.anthropicKeyEnc as string) : undefined,
    openai: row.openaiKeyEnc ? decryptKey(row.openaiKeyEnc as string) : undefined,
  };
}

export async function getRecruiteeCredentials(
  workspaceId: string,
): Promise<{ baseUrl: string; apiKey: string }> {
  const [row] = await sql`
    SELECT recruitee_base_url, recruitee_key_enc
    FROM workspace_settings
    WHERE workspace_id = ${workspaceId}
  `;
  if (!row?.recruiteeBaseUrl || !row?.recruiteeKeyEnc) {
    throw new Error('Recruitee not configured for this workspace');
  }
  return {
    baseUrl: row.recruiteeBaseUrl as string,
    apiKey: decryptKey(row.recruiteeKeyEnc as string),
  };
}
