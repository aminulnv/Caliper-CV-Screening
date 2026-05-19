import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { writeAuditLog } from '../middleware/audit.js';
import { sql } from '../services/db.js';
import { encryptKey } from '../services/key-manager.js';
import { fetchRecruiteeJobs } from '../services/recruitee.js';
import { getRecruiteeCredentials } from '../services/workspace.js';
import {
  normalizeCvRetentionDays,
  normalizeEvaluationRetentionDays,
  runRetentionCleanup,
} from '../services/retention.js';

const SUPPORTED_MODELS = [
  'claude-sonnet-4-6',
  'claude-opus-4-7',
  'claude-haiku-4-5-20251001',
  'gpt-4o',
  'gpt-4o-mini',
  'o3-mini',
];

/** Map DB row (camelCase from postgres.js) to API snake_case for the frontend. */
function formatSettingsResponse(row: Record<string, unknown>, workspaceId: string) {
  return {
    workspace_id: (row.workspaceId ?? row.workspace_id ?? workspaceId) as string,
    default_model: (row.defaultModel ?? row.default_model ?? 'claude-sonnet-4-6') as string,
    allowed_models: (row.allowedModels ?? row.allowed_models ?? ['claude-sonnet-4-6']) as string[],
    recruitee_base_url: (row.recruiteeBaseUrl ?? row.recruitee_base_url ?? null) as string | null,
    confidence_threshold: (row.confidenceThreshold ?? row.confidence_threshold ?? 60) as number,
    cv_retention_days: normalizeCvRetentionDays(
      (row.cvRetentionDays ?? row.cv_retention_days) as number,
    ),
    evaluation_retention_days: normalizeEvaluationRetentionDays(
      (row.evaluationRetentionDays ?? row.evaluation_retention_days) as number | null,
    ),
    has_anthropic_key: Boolean(row.hasAnthropicKey ?? row.has_anthropic_key),
    has_openai_key: Boolean(row.hasOpenaiKey ?? row.has_openai_key),
    has_recruitee_key: Boolean(row.hasRecruiteeKey ?? row.has_recruitee_key),
    supported_models: SUPPORTED_MODELS,
  };
}

async function upsertWorkspaceSettings(
  workspaceId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  if (Object.keys(updates).length === 0) return;

  const insertRow = { workspace_id: workspaceId, ...updates };
  await sql`
    INSERT INTO workspace_settings ${sql(insertRow)}
    ON CONFLICT (workspace_id) DO UPDATE SET
    ${sql(updates)}, updated_at = NOW()
  `;
}

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/settings', async (req) => {
    const [row] = await sql`
      SELECT workspace_id, default_model, allowed_models, recruitee_base_url, confidence_threshold,
             cv_retention_days, evaluation_retention_days,
             (anthropic_key_enc IS NOT NULL) AS has_anthropic_key,
             (openai_key_enc IS NOT NULL)    AS has_openai_key,
             (recruitee_key_enc IS NOT NULL) AS has_recruitee_key
      FROM workspace_settings
      WHERE workspace_id = ${req.workspaceId}
    `;
    if (!row) {
      return {
        workspace_id: req.workspaceId,
        default_model: 'claude-sonnet-4-6',
        allowed_models: ['claude-sonnet-4-6'],
        recruitee_base_url: null,
        confidence_threshold: 60,
        cv_retention_days: 90,
        evaluation_retention_days: 730,
        has_anthropic_key: false,
        has_openai_key: false,
        has_recruitee_key: false,
        supported_models: SUPPORTED_MODELS,
      };
    }
    return formatSettingsResponse(row as Record<string, unknown>, req.workspaceId);
  });

  app.put<{
    Body: {
      default_model?: string;
      allowed_models?: string[];
      anthropic_key?: string;
      openai_key?: string;
      recruitee_base_url?: string;
      recruitee_key?: string;
      confidence_threshold?: number;
      cv_retention_days?: number;
      evaluation_retention_days?: number | null;
    };
  }>(
    '/settings',
    { preHandler: requireRole('recruiter') },
    async (req, reply) => {
      const {
        default_model, allowed_models, anthropic_key, openai_key,
        recruitee_base_url, recruitee_key, confidence_threshold,
        cv_retention_days, evaluation_retention_days,
      } = req.body;

      if (default_model && !SUPPORTED_MODELS.includes(default_model)) {
        return reply.status(400).send({ error: `Unsupported model: ${default_model}` });
      }
      if (allowed_models?.some((m) => !SUPPORTED_MODELS.includes(m))) {
        return reply.status(400).send({ error: 'One or more unsupported models' });
      }

      // Build dynamic SET clause
      const updates: Record<string, unknown> = {};
      if (default_model) updates.default_model = default_model;
      if (allowed_models) updates.allowed_models = allowed_models;
      if (confidence_threshold != null) updates.confidence_threshold = confidence_threshold;
      if (recruitee_base_url != null) updates.recruitee_base_url = recruitee_base_url.trim();
      if (anthropic_key) updates.anthropic_key_enc = encryptKey(anthropic_key);
      if (openai_key) updates.openai_key_enc = encryptKey(openai_key);
      if (recruitee_key) updates.recruitee_key_enc = encryptKey(recruitee_key);
      if (cv_retention_days != null) {
        updates.cv_retention_days = normalizeCvRetentionDays(cv_retention_days);
      }
      if (evaluation_retention_days !== undefined) {
        updates.evaluation_retention_days = normalizeEvaluationRetentionDays(
          evaluation_retention_days,
        );
      }

      if (Object.keys(updates).length === 0) {
        return reply.status(400).send({ error: 'No settings fields to update' });
      }

      await upsertWorkspaceSettings(req.workspaceId, updates);

      await writeAuditLog({
        req, action: 'settings.updated', entityType: 'workspace', entityId: req.workspaceId,
        payload: {
          changed_fields: Object.keys(req.body).filter((k) => !k.endsWith('_key')),
          keys_updated: Object.keys(req.body).filter((k) => k.endsWith('_key')),
        },
      });

      return { success: true };
    },
  );

  app.post<{
    Body: { recruitee_base_url?: string; recruitee_key?: string };
  }>(
    '/settings/test-recruitee',
    { preHandler: requireRole('recruiter') },
    async (req, reply) => {
      const stored = await getRecruiteeCredentials(req.workspaceId).catch(() => null);
      const baseUrl = req.body?.recruitee_base_url?.trim() || stored?.baseUrl;
      const apiKey = req.body?.recruitee_key?.trim() || stored?.apiKey;

      if (!baseUrl || !apiKey) {
        return reply.status(400).send({
          error: 'Recruitee not configured. Enter the base URL and API key, then Save or Test connection.',
        });
      }

      try {
        const jobs = await fetchRecruiteeJobs(baseUrl, apiKey);
        return { success: true, jobs_found: jobs.length };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return reply.status(400).send({ error: `Connection failed: ${message}` });
      }
    },
  );

  app.post(
    '/settings/run-retention',
    { preHandler: requireRole('admin') },
    async () => {
      const stats = await runRetentionCleanup();
      return { success: true, ...stats };
    },
  );
}
