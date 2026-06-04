import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { writeAuditLog } from '../middleware/audit.js';
import { formatAuditEntry } from '../services/audit-format.js';
import { sql } from '../services/db.js';
import { fetchRecruiteeOfferMeta } from '../services/recruitee.js';
import { getRecruiteeCredentials } from '../services/workspace.js';
import { validateCriteriaPayload } from '../services/criteria-validation.js';
import { syncJobCriteria } from '../services/job-criteria.js';
import { generateCriteriaFromJobDescription } from '../services/criteria-generation.js';
import { getWorkspaceKeys, getWorkspaceSettings } from '../services/workspace.js';
import { pickRunnableModel } from '../services/screening-model.js';

async function fetchJobDetail(workspaceId: string, jobId: string) {
  const [job] = await sql`
    SELECT jp.*,
      COALESCE(
        json_agg(DISTINCT jc.*) FILTER (WHERE jc.id IS NOT NULL), '[]'
      ) AS job_criteria,
      COALESCE(
        json_agg(DISTINCT jsonb_build_object(
          'id', sr.id, 'status', sr.status,
          'cv_count', sr.cv_count, 'created_at', sr.created_at, 'score_range', sr.score_range
        )) FILTER (WHERE sr.id IS NOT NULL), '[]'
      ) AS screening_runs
    FROM job_profiles jp
    LEFT JOIN job_criteria jc ON jc.job_id = jp.id AND jc.archived = false
    LEFT JOIN screening_runs sr ON sr.job_id = jp.id
    WHERE jp.id = ${jobId} AND jp.workspace_id = ${workspaceId}
    GROUP BY jp.id
  `;
  return job;
}

const SUPPORTED_SCREENING_MODELS = [
  'claude-sonnet-4-6',
  'claude-opus-4-7',
  'claude-haiku-4-5-20251001',
  'gpt-4o',
  'gpt-4o-mini',
  'o3-mini',
];

export async function jobsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/jobs', async (req) => {
    return sql`
      SELECT jp.*,
        COALESCE(
          json_agg(DISTINCT jc.*) FILTER (WHERE jc.id IS NOT NULL), '[]'
        ) AS job_criteria,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'id', sr.id, 'status', sr.status,
            'cv_count', sr.cv_count, 'created_at', sr.created_at, 'score_range', sr.score_range
          )) FILTER (WHERE sr.id IS NOT NULL), '[]'
        ) AS screening_runs
      FROM job_profiles jp
      LEFT JOIN job_criteria jc ON jc.job_id = jp.id AND jc.archived = false
      LEFT JOIN screening_runs sr ON sr.job_id = jp.id
      WHERE jp.workspace_id = ${req.workspaceId}
      GROUP BY jp.id
      ORDER BY jp.updated_at DESC
    `;
  });

  app.get<{ Params: { id: string } }>('/jobs/:id', async (req, reply) => {
    const job = await fetchJobDetail(req.workspaceId, req.params.id);
    if (!job) return reply.status(404).send({ error: 'Job not found' });
    return job;
  });

  app.post<{ Params: { id: string } }>(
    '/jobs/:id/refresh-recruitee',
    { preHandler: requireRole('recruiter') },
    async (req, reply) => {
      const jobId = req.params.id;
      const [existing] = await sql`
        SELECT id, source, source_ref, description
        FROM job_profiles
        WHERE id = ${jobId} AND workspace_id = ${req.workspaceId}
      `;
      if (!existing) return reply.status(404).send({ error: 'Job not found' });
      if (existing.source !== 'recruitee' || !existing.sourceRef) {
        return reply.status(400).send({ error: 'Job is not linked to Recruitee' });
      }

      try {
        const creds = await getRecruiteeCredentials(req.workspaceId);
        const meta = await fetchRecruiteeOfferMeta(
          creds.baseUrl,
          creds.apiKey,
          existing.sourceRef as string,
        );

        const currentDesc = (existing.description as string | null) ?? '';
        const isPlaceholder =
          !currentDesc
          || currentDesc.startsWith('Synced from Recruitee')
          || currentDesc.startsWith('Imported from Recruitee');
        const nextDescription =
          meta.description?.trim() && isPlaceholder
            ? meta.description.trim()
            : currentDesc || meta.description?.trim() || null;

        await sql`
          UPDATE job_profiles SET
            dept = COALESCE(${meta.department}, dept),
            posted_on = COALESCE(${meta.posted_on}, posted_on),
            applicants_count = ${meta.applicants_count},
            description = ${nextDescription},
            updated_at = NOW()
          WHERE id = ${jobId} AND workspace_id = ${req.workspaceId}
        `;

        await writeAuditLog({
          req,
          action: 'job.refreshed_recruitee',
          entityType: 'job',
          entityId: jobId,
          payload: {
            job_id: jobId,
            applicants_count: meta.applicants_count,
            description_updated: Boolean(meta.description?.trim() && isPlaceholder),
          },
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return reply.status(400).send({ error: `Recruitee refresh failed: ${message}` });
      }

      const job = await fetchJobDetail(req.workspaceId, jobId);
      if (!job) return reply.status(404).send({ error: 'Job not found' });
      return job;
    },
  );

  app.post<{
    Params: { id: string };
    Body: { model_id?: string; description?: string };
  }>(
    '/jobs/:id/generate-criteria',
    { preHandler: requireRole('recruiter') },
    async (req, reply) => {
      const jobId = req.params.id;
      const [job] = await sql`
        SELECT id, name, description, screening_model
        FROM job_profiles
        WHERE id = ${jobId} AND workspace_id = ${req.workspaceId}
      `;
      if (!job) return reply.status(404).send({ error: 'Job not found' });

      const description =
        (req.body.description?.trim() || (job.description as string | null)?.trim() || '');
      if (!description) {
        return reply.status(400).send({
          error: 'Job description is required. Paste the full JD on the Overview tab first.',
        });
      }

      const settings = await getWorkspaceSettings(req.workspaceId);
      const keys = await getWorkspaceKeys(req.workspaceId);
      const preferred =
        req.body.model_id?.trim()
        || ((job.screeningModel ?? job.screening_model) as string | null)
        || settings.default_model;
      const pick = pickRunnableModel(preferred, settings.allowed_models, keys);

      try {
        const generated = await generateCriteriaFromJobDescription(
          String(job.name),
          description,
          pick.modelId,
          keys,
        );

        await writeAuditLog({
          req,
          action: 'job.criteria_generated',
          entityType: 'job',
          entityId: jobId,
          payload: {
            job_id: jobId,
            model_used: pick.modelId,
            must_count: generated.must_have.length,
            nice_count: generated.nice_to_have.length,
            flag_count: generated.red_flags.length,
            skipped_count: generated.skipped_count,
          },
        });

        return {
          ...generated,
          model_used: pick.modelId,
          model_substituted: pick.substituted,
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.get<{ Params: { id: string } }>('/jobs/:id/audit', async (req, reply) => {
    const jobId = req.params.id;

    const [job] = await sql`
      SELECT id FROM job_profiles
      WHERE id = ${jobId} AND workspace_id = ${req.workspaceId}
    `;
    if (!job) return reply.status(404).send({ error: 'Job not found' });

    const rows = await sql`
      SELECT al.id, al.action, al.payload, al.created_at,
             al.user_id AS user_id,
             u.name AS user_name,
             u.email AS user_email
      FROM audit_log al
      LEFT JOIN users u ON u.sub = al.user_id
      WHERE al.workspace_id = ${req.workspaceId}
        AND (
          (al.entity_type = 'job' AND al.entity_id = ${jobId})
          OR (al.entity_type = 'run' AND al.payload->>'job_id' = ${jobId})
          OR (al.payload->>'job_id' = ${jobId})
        )
      ORDER BY al.created_at DESC
      LIMIT 100
    `;

    return rows.map((row) =>
      formatAuditEntry(
        {
          id: row.id as string,
          action: row.action as string,
          payload: row.payload as Record<string, unknown> | null,
          userId: row.userId as string,
          userName: row.userName as string | null,
          userEmail: row.userEmail as string | null,
          createdAt: row.createdAt as Date,
        },
        req.userId,
      ),
    );
  });

  app.put<{
    Params: { id: string };
    Body: {
      name: string;
      dept?: string;
      status?: string;
      source?: string;
      source_ref?: string;
      description?: string;
      posted_on?: string;
      screening_model?: string | null;
      criteria?: Array<{ id: string; kind: 'must' | 'nice' | 'flag'; name: string; weight: number; biased?: boolean }>;
    };
  }>(
    '/jobs/:id',
    { preHandler: requireRole('recruiter') },
    async (req, reply) => {
      const { id } = req.params;
      const { name, dept, status, source, source_ref, description, posted_on, screening_model, criteria } = req.body;
      if (!name) return reply.status(400).send({ error: 'name is required' });
      if (
        screening_model != null
        && !SUPPORTED_SCREENING_MODELS.includes(screening_model)
      ) {
        return reply.status(400).send({ error: `Unsupported screening model: ${screening_model}` });
      }

      await sql`
        INSERT INTO job_profiles (id, workspace_id, name, dept, status, source, source_ref, description, posted_on, screening_model, created_by, updated_at)
        VALUES (${id}, ${req.workspaceId}, ${name}, ${dept ?? null}, ${status ?? 'open'}, ${source ?? 'manual'},
                ${source_ref ?? null}, ${description ?? null}, ${posted_on ?? null}, ${screening_model ?? null}, ${req.userId}, NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name, dept = EXCLUDED.dept, status = EXCLUDED.status,
          source = EXCLUDED.source, source_ref = EXCLUDED.source_ref,
          description = EXCLUDED.description, posted_on = EXCLUDED.posted_on,
          screening_model = EXCLUDED.screening_model,
          updated_at = NOW()
      `;

      if (criteria) {
        const validation = validateCriteriaPayload(criteria);
        if (!validation.ok) {
          return reply.status(400).send({ error: validation.error });
        }
        await syncJobCriteria(
          id,
          criteria.map((c) => ({
            id: c.id,
            kind: c.kind,
            name: c.name,
            weight: c.weight,
            biased: c.biased ?? false,
          })),
        );
      }

      const mustCount = criteria?.filter((c) => c.kind === 'must').length ?? 0;
      const niceCount = criteria?.filter((c) => c.kind === 'nice').length ?? 0;
      const flagCount = criteria?.filter((c) => c.kind === 'flag').length ?? 0;
      const biasedCount = criteria?.filter((c) => c.biased).length ?? 0;

      await writeAuditLog({
        req,
        action: 'job.upserted',
        entityType: 'job',
        entityId: id,
        payload: {
          job_id: id,
          name,
          criteria_count: criteria?.length ?? 0,
          must_count: mustCount,
          nice_count: niceCount,
          flag_count: flagCount,
          biased_count: biasedCount,
          screening_model,
        },
      });

      return { success: true };
    },
  );
}
