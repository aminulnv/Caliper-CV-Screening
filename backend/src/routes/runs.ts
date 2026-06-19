import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { writeAuditLog, writeAuditLogDirect } from '../middleware/audit.js';
import { sql } from '../services/db.js';
import { scoreCV } from '../services/model-router.js';
import { assertCanSpend, logAiUsage, BudgetExceededError } from '../services/ai-usage.js';
import { estimateScreeningCostUsd } from '../lib/model-pricing.js';
import { getWorkspaceKeys, getWorkspaceSettings } from '../services/workspace.js';
import { parsePdfBuffer } from '../services/cv-parser.js';
import { storage } from '../services/storage.js';
import { randomUUID } from 'crypto';
import type { Criterion, ScoringRequest, CriterionResult } from '../types/index.js';
import { countJobCriteria } from '../services/job-criteria.js';
import { mapCriterionRows, pickRunnableModel } from '../services/screening-model.js';
import { isWorkspaceStoragePath } from '../lib/storage-path.js';
import { formatRunCandidateRow } from '../lib/run-candidate-format.js';
import { formatRunResponse } from '../lib/run-format.js';
import {
  buildEmbeddingDocument,
  upsertCandidateEmbedding,
} from '../services/cv-embedding.js';
import { semanticCvSearchEnabled } from '../config/features.js';
import { alertRunCompleted, alertRunFailed, alertRunShared } from '../services/alerting.js';
import { runVisibleToUser } from '../lib/run-access.js';

/** Align with Recruitee applicant fetch cap; override via MAX_CV_SOURCES_PER_RUN env. */
const MAX_CV_SOURCES_PER_RUN = Number(process.env.MAX_CV_SOURCES_PER_RUN) || 10_000;

function validateCvSources(
  cvSources: Array<{ type: string; path?: string; name?: string }>,
  workspaceId: string,
): string | null {
  if (cvSources.length > MAX_CV_SOURCES_PER_RUN) {
    return `Maximum ${MAX_CV_SOURCES_PER_RUN} CVs per run`;
  }
  for (const source of cvSources) {
    if (source.type === 'storage') {
      if (!source.path?.trim()) return 'Storage CV source requires a path';
      if (!isWorkspaceStoragePath(source.path, workspaceId)) {
        return 'Forbidden';
      }
    }
  }
  return null;
}

export async function runsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // Runs are private to their owner unless explicitly shared (run_shares).
  app.get('/runs', async (req) => {
    const runs = await sql`
      SELECT sr.id, sr.job_id, sr.model_used, sr.status, sr.owner_id, sr.cv_count,
             sr.score_range, sr.error_message, sr.started_at, sr.completed_at, sr.created_at,
             jp.name AS job_name, jp.dept AS job_dept,
             u.name AS owner_name, u.email AS owner_email, u.avatar_url AS owner_avatar_url,
             COALESCE(shares.user_ids, '{}') AS shared_user_ids,
             COALESCE(shared.shared_users, '[]'::json) AS shared_users
      FROM screening_runs sr
      LEFT JOIN job_profiles jp ON sr.job_id = jp.id
      LEFT JOIN users u ON u.sub = sr.owner_id
      LEFT JOIN LATERAL (
        SELECT array_agg(rs.user_id) AS user_ids
        FROM run_shares rs
        WHERE rs.run_id = sr.id
      ) shares ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
          'user_id', rs.user_id,
          'name', su.name,
          'email', su.email,
          'avatar_url', su.avatar_url
        ) ORDER BY su.name) AS shared_users
        FROM run_shares rs
        JOIN users su ON su.sub = rs.user_id
        WHERE rs.run_id = sr.id
      ) shared ON true
      WHERE ${runVisibleToUser(req.workspaceId, req.userId)}
      ORDER BY sr.created_at DESC
    `;
    return runs.map((r) => formatRunResponse(r as Record<string, unknown>, req.userId));
  });

  app.get<{ Params: { id: string } }>('/runs/:id', async (req, reply) => {
    const [run] = await sql`
      SELECT sr.*, jp.name AS job_name, jp.dept AS job_dept,
             u.name AS owner_name, u.email AS owner_email, u.avatar_url AS owner_avatar_url,
             COALESCE(shares.user_ids, '{}') AS shared_user_ids,
             COALESCE(shared.shared_users, '[]'::json) AS shared_users
      FROM screening_runs sr
      LEFT JOIN job_profiles jp ON sr.job_id = jp.id
      LEFT JOIN users u ON u.sub = sr.owner_id
      LEFT JOIN LATERAL (
        SELECT array_agg(rs.user_id) AS user_ids
        FROM run_shares rs
        WHERE rs.run_id = sr.id
      ) shares ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
          'user_id', rs.user_id,
          'name', su.name,
          'email', su.email,
          'avatar_url', su.avatar_url
        ) ORDER BY su.name) AS shared_users
        FROM run_shares rs
        JOIN users su ON su.sub = rs.user_id
        WHERE rs.run_id = sr.id
      ) shared ON true
      WHERE sr.id = ${req.params.id}
        AND ${runVisibleToUser(req.workspaceId, req.userId)}
    `;
    if (!run) return reply.status(404).send({ error: 'Run not found' });

    const candidates = await sql`
      SELECT id, name, title, location, score, confidence, status, summary,
             parse_warning, must_met, nice_met, flag_triggered,
             score_base, penalty_flag, cv_quality_score, quality_adjustment,
             must_total, nice_total, flag_total,
             criteria_met_pct, must_met_pct, nice_met_pct,
             cv_storage_path, recruitee_applicant_id, applicant_email,
             disposition, target_stage_id, target_stage_name, disposition_note,
             disposition_by, disposition_at, recruitee_placement_id,
             recruitee_sync_status, recruitee_synced_at, recruitee_sync_error
      FROM run_candidates
      WHERE run_id = ${req.params.id}
      ORDER BY score DESC NULLS LAST
    `;

    return {
      ...formatRunResponse(run as Record<string, unknown>, req.userId),
      candidates: candidates.map((c) => formatRunCandidateRow(c as Record<string, unknown>)),
    };
  });

  app.get<{ Params: { id: string }; Querystring: { ids?: string } }>(
    '/runs/:id/compare',
    async (req, reply) => {
      const rawIds = req.query.ids?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
      const candidateIds = [...new Set(rawIds)];

      if (candidateIds.length < 2 || candidateIds.length > 4) {
        return reply.status(400).send({ error: 'Provide 2 to 4 candidate ids via ids=id1,id2,...' });
      }

      const [run] = await sql`
        SELECT sr.id, sr.job_id
        FROM screening_runs sr
        WHERE sr.id = ${req.params.id}
          AND ${runVisibleToUser(req.workspaceId, req.userId)}
      `;
      if (!run) return reply.status(404).send({ error: 'Run not found' });

      const jobId = (run.jobId ?? run.job_id) as string;

      const candidateRows = await sql`
        SELECT id, name, title, location, score, confidence, status, summary,
               parse_warning, must_met, nice_met, flag_triggered,
               score_base, penalty_flag, cv_quality_score, quality_adjustment,
               must_total, nice_total, flag_total,
               criteria_met_pct, must_met_pct, nice_met_pct,
               cv_storage_path, recruitee_applicant_id, applicant_email,
               disposition, target_stage_id, target_stage_name, disposition_note,
               disposition_by, disposition_at, recruitee_placement_id,
               recruitee_sync_status, recruitee_synced_at, recruitee_sync_error
        FROM run_candidates
        WHERE run_id = ${req.params.id} AND id IN ${sql(candidateIds)}
      `;

      if (candidateRows.length !== candidateIds.length) {
        return reply.status(404).send({ error: 'One or more candidates not found in this run' });
      }

      const byId = new Map(
        candidateRows.map((c) => [c.id as string, formatRunCandidateRow(c as Record<string, unknown>)]),
      );
      const candidatesOrdered = candidateIds.map((id) => byId.get(id)!);

      const criteriaRows = await sql`
        SELECT id, kind, name, weight
        FROM job_criteria
        WHERE job_id = ${jobId} AND archived = false
        ORDER BY
          CASE kind WHEN 'must' THEN 0 WHEN 'nice' THEN 1 WHEN 'flag' THEN 2 ELSE 3 END,
          name ASC
      `;

      const criteria = criteriaRows.map((c) => ({
        id: c.id as string,
        kind: c.kind as 'must' | 'nice' | 'flag',
        name: c.name as string,
        weight: Number(c.weight),
      }));

      const evalRows = await sql`
        SELECT ce.candidate_id, ce.criterion_id, ce.met, ce.confidence, ce.quote,
               ce.inferred, ce.overridden_by, ce.agreed_by
        FROM candidate_evaluations ce
        JOIN run_candidates rc ON ce.candidate_id = rc.id
        WHERE rc.run_id = ${req.params.id}
          AND ce.candidate_id IN ${sql(candidateIds)}
      `;

      const evaluations: Record<
        string,
        Record<
          string,
          {
            met: boolean | null;
            confidence: string | null;
            quote: string | null;
            inferred: boolean;
            overridden_by: string | null;
            agreed_by: string | null;
          }
        >
      > = {};

      for (const id of candidateIds) {
        evaluations[id] = {};
      }

      for (const row of evalRows) {
        const candidateId = (row.candidateId ?? row.candidate_id) as string;
        const criterionId = (row.criterionId ?? row.criterion_id) as string;
        if (!evaluations[candidateId]) evaluations[candidateId] = {};
        evaluations[candidateId][criterionId] = {
          met: row.met as boolean | null,
          confidence: (row.confidence as string | null) ?? null,
          quote: (row.quote as string | null) ?? null,
          inferred: Boolean(row.inferred),
          overridden_by: (row.overriddenBy ?? row.overridden_by ?? null) as string | null,
          agreed_by: (row.agreedBy ?? row.agreed_by ?? null) as string | null,
        };
      }

      return {
        run_id: req.params.id,
        candidates: candidatesOrdered,
        criteria,
        evaluations,
      };
    },
  );

  // Replace the share list for a run. Owner only; recipients must be workspace members.
  app.put<{ Params: { id: string }; Body: { user_ids?: string[] } }>(
    '/runs/:id/shares',
    async (req, reply) => {
      const [run] = await sql`
        SELECT sr.id, sr.owner_id, jp.name AS job_name
        FROM screening_runs sr
        LEFT JOIN job_profiles jp ON sr.job_id = jp.id
        WHERE sr.id = ${req.params.id} AND sr.workspace_id = ${req.workspaceId}
      `;
      if (!run) return reply.status(404).send({ error: 'Run not found' });
      if ((run.ownerId ?? run.owner_id) !== req.userId) {
        return reply.status(403).send({ error: 'Only the run owner can share this run' });
      }

      const rawIds = req.body?.user_ids ?? [];
      const requested = [...new Set(
        rawIds
          .map((id) => (id != null && id !== '' ? String(id).trim() : ''))
          .filter((id) => id && id !== req.userId),
      )];

      if (rawIds.length > 0 && requested.length === 0) {
        return reply.status(400).send({
          error: 'No valid recipients. Pick someone from the workspace member list to share with.',
        });
      }

      let memberIds: string[] = [];
      if (requested.length > 0) {
        const members = await sql`
          SELECT user_id FROM user_roles
          WHERE workspace_id = ${req.workspaceId} AND user_id = ANY(${requested})
        `;
        memberIds = members.map((m) => String(m.userId ?? m.user_id));
        if (memberIds.length !== requested.length) {
          return reply.status(400).send({ error: 'All recipients must be workspace members' });
        }
      }

      const previousShares = await sql`
        SELECT user_id FROM run_shares WHERE run_id = ${req.params.id}
      `;
      const previousIds = new Set(
        previousShares.map((row) => String(row.userId ?? row.user_id)),
      );
      const newlySharedIds = memberIds.filter((id) => !previousIds.has(id));

      await sql.begin(async (tx) => {
        await tx`DELETE FROM run_shares WHERE run_id = ${req.params.id}`;
        if (memberIds.length > 0) {
          const rows = memberIds.map((userId) => ({
            run_id: req.params.id,
            user_id: userId,
            shared_by: req.userId,
          }));
          await tx`INSERT INTO run_shares ${tx(rows)}`;
        }
      });

      await writeAuditLog({
        req,
        action: 'run.shared',
        entityType: 'run',
        entityId: req.params.id,
        payload: { run_id: req.params.id, shared_with: memberIds },
      });

      if (newlySharedIds.length > 0) {
        const runId = req.params.id;
        const jobName = String((run.jobName ?? run.job_name) || runId);
        const [sharer] = await sql`
          SELECT name, email FROM users WHERE sub = ${req.userId} LIMIT 1
        `;
        const sharerName = (sharer?.name as string | null) ?? null;
        const sharerEmail = (sharer?.email as string | null) ?? null;

        for (const recipientUserId of newlySharedIds) {
          void alertRunShared({
            workspaceId: req.workspaceId!,
            recipientUserId,
            runId,
            jobName,
            sharerName,
            sharerEmail,
          }).catch((err) => console.error('[alert] run shared:', err));
        }
      }

      return { success: true, shared_user_ids: memberIds };
    },
  );

  app.post<{
    Body: {
      job_id: string;
      model_id?: string;
      run_note?: string;
      cv_sources: Array<
        | { type: 'storage'; path: string; name: string }
        | {
            type: 'recruitee';
            applicant_id: string;
            cv_url: string;
            name: string;
            email?: string;
            placement_id?: string;
          }
      >;
    };
  }>(
    '/runs',
    { preHandler: requireRole('recruiter') },
    async (req, reply) => {
      const { job_id, model_id, cv_sources } = req.body;
      const runNote =
        typeof req.body.run_note === 'string' && req.body.run_note.trim()
          ? req.body.run_note.trim().slice(0, 2000)
          : null;
      if (!job_id || !cv_sources?.length) {
        return reply.status(400).send({ error: 'job_id and cv_sources are required' });
      }

      const cvSourceError = validateCvSources(cv_sources, req.workspaceId);
      if (cvSourceError === 'Forbidden') {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      if (cvSourceError) {
        return reply.status(400).send({ error: cvSourceError });
      }

      const [job] = await sql`
        SELECT id, screening_model FROM job_profiles
        WHERE id = ${job_id} AND workspace_id = ${req.workspaceId}
      `;
      if (!job) return reply.status(404).send({ error: 'Job not found' });

      const criteriaCount = await countJobCriteria(job_id);
      if (criteriaCount === 0) {
        return reply.status(400).send({
          error: 'This job has no saved screening criteria. Add and save criteria on the Criteria tab before running.',
        });
      }

      const settings = await getWorkspaceSettings(req.workspaceId);
      const keys = await getWorkspaceKeys(req.workspaceId);
      const jobModel = (job.screeningModel ?? job.screening_model) as string | null | undefined;
      const preferred = model_id ?? jobModel ?? settings.default_model;
      if (!preferred) {
        return reply.status(400).send({ error: 'No screening model configured for this job or workspace' });
      }

      let modelId: string;
      let modelSubstituted = false;
      try {
        const picked = pickRunnableModel(preferred, settings.allowed_models, keys);
        modelId = picked.modelId;
        modelSubstituted = picked.substituted;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'AI screening is not configured';
        return reply.status(400).send({ error: message });
      }

      try {
        const estimatedCost = estimateScreeningCostUsd(
          modelId,
          cv_sources.length,
          criteriaCount,
        );
        await assertCanSpend(req.userId, req.workspaceId, estimatedCost);
      } catch (err) {
        if (err instanceof BudgetExceededError) {
          return reply.status(403).send({
            error: 'budget_exceeded',
            message: err.message,
            spent_usd: err.spentUsd,
            budget_usd: err.budgetUsd,
          });
        }
        throw err;
      }

      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const yyyy = String(now.getFullYear());
      const runId = `${dd}${mm}${yyyy}-${Date.now().toString(36)}`;

      await sql`
        INSERT INTO screening_runs (id, workspace_id, job_id, model_used, status, owner_id, cv_count, run_note, started_at)
        VALUES (${runId}, ${req.workspaceId}, ${job_id}, ${modelId}, 'in_progress', ${req.userId}, ${cv_sources.length}, ${runNote}, NOW())
      `;

      await writeAuditLog({
        req,
        action: 'run.created',
        entityType: 'run',
        entityId: runId,
        payload: {
          job_id,
          run_id: runId,
          model_id: modelId,
          model_requested: preferred,
          model_substituted: modelSubstituted,
          cv_count: cv_sources.length,
          run_note: runNote,
        },
      });

      void processRun(runId, job_id, modelId, cv_sources, req.workspaceId, req.userId).catch(
        async (err) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          await sql`
            UPDATE screening_runs SET status = 'failed', error_message = ${errMsg} WHERE id = ${runId}
          `;
          await writeAuditLogDirect({
            workspaceId: req.workspaceId,
            userId: req.userId,
            action: 'run.failed',
            entityType: 'run',
            entityId: runId,
            payload: { job_id, run_id: runId, error: errMsg },
          });
          const [jobRow] = await sql`SELECT name FROM job_profiles WHERE id = ${job_id} LIMIT 1`;
          void alertRunFailed({
            workspaceId: req.workspaceId,
            ownerId: req.userId,
            runId,
            jobName: (jobRow?.name as string) ?? 'Job',
            cvCount: cv_sources.length,
            errorMessage: errMsg,
          }).catch((e) => console.error('[alert] run failed:', e));
        },
      );

      reply.status(202).send({
        run_id: runId,
        status: 'in_progress',
        model_used: modelId,
        model_substituted: modelSubstituted,
        ...(modelSubstituted
          ? {
              model_notice: `Used ${modelId} because ${preferred} has no API key configured.`,
            }
          : {}),
      });
    },
  );
}

async function processRun(
  runId: string,
  jobId: string,
  modelId: string,
  cvSources: Array<{
    type: string;
    path?: string;
    name: string;
    applicant_id?: string;
    cv_url?: string;
    email?: string;
    placement_id?: string;
  }>,
  workspaceId: string,
  ownerId: string,
) {
  const [keys, criteriaRows, settings, jobMetaRows] = await Promise.all([
    getWorkspaceKeys(workspaceId),
    sql`SELECT * FROM job_criteria WHERE job_id = ${jobId} AND archived = false`,
    getWorkspaceSettings(workspaceId),
    sql`SELECT source, source_ref FROM job_profiles WHERE id = ${jobId} LIMIT 1`,
  ]);
  const criteria = mapCriterionRows(criteriaRows as Record<string, unknown>[]);
  const jobMeta = (jobMetaRows as Record<string, unknown>[])[0];
  const jobSource = (jobMeta?.source as string | null) ?? 'manual';
  const jobSourceRef = (jobMeta?.sourceRef ?? jobMeta?.source_ref) as string | null;

  const scores: number[] = [];
  const scoringErrors: string[] = [];

  for (const source of cvSources) {
    let pdfBuffer: Buffer;
    let storagePath: string | null = null;
    let recruiteeId: string | null = null;
    let placementId: string | null = null;

    if (source.type === 'storage' && source.path) {
      if (!isWorkspaceStoragePath(source.path, workspaceId)) {
        throw new Error(`Forbidden storage path: ${source.path}`);
      }
      pdfBuffer = await storage.download(source.path);
      storagePath = source.path;
    } else if (source.type === 'recruitee' && (source.cv_url || source.applicant_id)) {
      const {
        downloadRecruiteeCV,
        fetchRecruiteeCandidateCv,
        fetchRecruiteePlacementIdForOffer,
      } = await import('../services/recruitee.js');
      const { getRecruiteeCredentials } = await import('../services/workspace.js');
      const creds = await getRecruiteeCredentials(workspaceId);
      recruiteeId = source.applicant_id ?? null;
      placementId = source.placement_id?.trim() || null;
      if (!placementId && recruiteeId && jobSource === 'recruitee' && jobSourceRef) {
        try {
          placementId = await fetchRecruiteePlacementIdForOffer(
            creds.baseUrl,
            creds.apiKey,
            recruiteeId,
            jobSourceRef,
          );
        } catch {
          placementId = null;
        }
      }
      if (source.cv_url?.startsWith('http')) {
        pdfBuffer = await downloadRecruiteeCV(source.cv_url, creds.apiKey);
      } else if (source.applicant_id) {
        const fetched = await fetchRecruiteeCandidateCv(
          creds.baseUrl,
          creds.apiKey,
          source.applicant_id,
        );
        pdfBuffer = fetched.buffer;
      } else {
        continue;
      }
      const recruiteePath = `${workspaceId}/runs/${runId}/${randomUUID()}.pdf`;
      await storage.upload(recruiteePath, pdfBuffer, 'application/pdf');
      storagePath = recruiteePath;
    } else {
      continue;
    }

    const parsed = await parsePdfBuffer(pdfBuffer);

    let scoringResult;
    let scoringError: string | null = null;
    try {
      const scored = await scoreCV(
        {
          cvText: parsed.text,
          criteria,
          modelId,
          candidateName: source.name,
          confidenceThreshold: settings.confidence_threshold,
        } satisfies ScoringRequest,
        keys,
      );
      scoringResult = scored.result;
      await logAiUsage({
        workspaceId,
        userId: ownerId,
        feature: 'screening',
        usage: scored.usage,
        runId,
        jobId,
      });
    } catch (err) {
      scoringError = err instanceof Error ? err.message : String(err);
      scoringErrors.push(`${source.name}: ${scoringError}`);
      console.error(`[run ${runId}] scoreCV failed for ${source.name}:`, err);
    }

    const summary = scoringResult?.summary
      ?? (scoringError ? `AI scoring failed: ${scoringError}` : null);

    const applicantEmail =
      source.type === 'recruitee' && typeof source.email === 'string' && source.email.trim()
        ? source.email.trim().toLowerCase()
        : null;

    const [candidateRow] = await sql`
      INSERT INTO run_candidates
        (run_id, name, score, confidence, status, summary, parse_warning,
         must_met, nice_met, flag_triggered, score_base, penalty_flag,
         cv_quality_score, quality_adjustment,
         must_total, nice_total, flag_total, criteria_met_pct, must_met_pct, nice_met_pct,
         cv_storage_path, recruitee_applicant_id, applicant_email, recruitee_placement_id)
      VALUES (
        ${runId}, ${source.name}, ${scoringResult?.score ?? null},
        ${scoringResult?.confidence ?? null}, ${scoringResult?.status ?? 'review'},
        ${summary}, ${parsed.warning ?? scoringError ?? null},
        ${scoringResult?.must_met ?? 0}, ${scoringResult?.nice_met ?? 0},
        ${scoringResult?.flag_triggered ?? 0},
        ${scoringResult?.base_score ?? null},
        ${scoringResult?.flag_penalty ?? null},
        ${scoringResult?.cv_quality_score ?? null},
        ${scoringResult?.quality_adjustment ?? null},
        ${scoringResult?.must_total ?? null}, ${scoringResult?.nice_total ?? null},
        ${scoringResult?.flag_total ?? null}, ${scoringResult?.criteria_met_pct ?? null},
        ${scoringResult?.must_met_pct ?? null}, ${scoringResult?.nice_met_pct ?? null},
        ${storagePath}, ${recruiteeId}, ${applicantEmail}, ${placementId}
      )
      RETURNING id
    `;

    if (candidateRow && scoringResult?.criteria_results?.length) {
      const evals = scoringResult.criteria_results.map((cr: CriterionResult) => ({
        candidate_id: candidateRow.id,
        criterion_id: cr.criterion_id,
        met: cr.met,
        ai_met: cr.met,
        confidence: cr.confidence,
        quote: cr.quote,
        inferred: cr.inferred,
        notes: cr.notes,
      }));
      await sql`INSERT INTO candidate_evaluations ${sql(evals)}`;
    }

    if (candidateRow && semanticCvSearchEnabled) {
      const embeddingDocument = buildEmbeddingDocument(
        source.name,
        parsed.text,
        summary,
      );
      void upsertCandidateEmbedding({
        candidateId: candidateRow.id as string,
        workspaceId,
        document: embeddingDocument,
        keys,
        userId: ownerId,
        runId,
        jobId,
      }).catch((err) => {
        console.error(`[run ${runId}] cv embedding failed for ${source.name}:`, err);
      });
    }

    if (scoringResult?.score != null) scores.push(scoringResult.score as number);
  }

  const scoreRange = scores.length ? [Math.min(...scores), Math.max(...scores)] : null;
  const allFailed = cvSources.length > 0 && scores.length === 0;
  const runError = allFailed
    ? scoringErrors[0] ?? 'AI scoring failed for all candidates'
    : null;

  await sql`
    UPDATE screening_runs
    SET status = ${allFailed ? 'failed' : 'completed'},
        completed_at = NOW(),
        score_range = ${scoreRange},
        error_message = ${runError}
    WHERE id = ${runId}
  `;

  await writeAuditLogDirect({
    workspaceId,
    userId: ownerId,
    action: 'run.completed',
    entityType: 'run',
    entityId: runId,
    payload: {
      job_id: jobId,
      run_id: runId,
      cv_count: scores.length,
      score_range: scoreRange,
    },
  });

  const [jobRow] = await sql`SELECT name FROM job_profiles WHERE id = ${jobId} LIMIT 1`;
  const jobName = (jobRow?.name as string) ?? 'Job';

  if (allFailed) {
    void alertRunFailed({
      workspaceId,
      ownerId,
      runId,
      jobName,
      cvCount: cvSources.length,
      errorMessage: runError ?? 'AI scoring failed for all candidates',
    }).catch((err) => console.error('[alert] run failed:', err));
  } else {
    void alertRunCompleted({
      workspaceId,
      ownerId,
      runId,
      jobName,
      cvCount: scores.length,
      scoreRange: scoreRange as [number, number] | null,
    }).catch((err) => console.error('[alert] run completed:', err));
  }
}
