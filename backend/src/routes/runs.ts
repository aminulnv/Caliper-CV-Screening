import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { writeAuditLog, writeAuditLogDirect } from '../middleware/audit.js';
import { sql } from '../services/db.js';
import { scoreCV } from '../services/model-router.js';
import { getWorkspaceKeys, getWorkspaceSettings } from '../services/workspace.js';
import { parsePdfBuffer } from '../services/cv-parser.js';
import { storage } from '../services/storage.js';
import { randomUUID } from 'crypto';
import type { Criterion, ScoringRequest, CriterionResult } from '../types/index.js';
import { countJobCriteria } from '../services/job-criteria.js';
import { mapCriterionRows, pickRunnableModel } from '../services/screening-model.js';
import { isWorkspaceStoragePath } from '../lib/storage-path.js';
import { formatRunCandidateRow } from '../lib/run-candidate-format.js';

const MAX_CV_SOURCES_PER_RUN = 50;

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

  app.get('/runs', async (req) => {
    const runs = await sql`
      SELECT sr.id, sr.job_id, sr.model_used, sr.status, sr.owner_id, sr.cv_count,
             sr.score_range, sr.error_message, sr.started_at, sr.completed_at, sr.created_at,
             jp.name AS job_name, jp.dept AS job_dept
      FROM screening_runs sr
      LEFT JOIN job_profiles jp ON sr.job_id = jp.id
      WHERE sr.workspace_id = ${req.workspaceId}
      ORDER BY sr.created_at DESC
    `;
    return runs.map((r) => ({
      ...r,
      job_profiles: r.jobName ? { name: r.jobName, dept: r.jobDept } : null,
    }));
  });

  app.get<{ Params: { id: string } }>('/runs/:id', async (req, reply) => {
    const [run] = await sql`
      SELECT sr.*, jp.name AS job_name, jp.dept AS job_dept
      FROM screening_runs sr
      LEFT JOIN job_profiles jp ON sr.job_id = jp.id
      WHERE sr.id = ${req.params.id} AND sr.workspace_id = ${req.workspaceId}
    `;
    if (!run) return reply.status(404).send({ error: 'Run not found' });

    const candidates = await sql`
      SELECT id, name, title, location, score, confidence, status, summary,
             parse_warning, must_met, nice_met, flag_triggered,
             score_base, penalty_must, penalty_flag,
             must_total, nice_total, flag_total,
             criteria_met_pct, must_met_pct, nice_met_pct
      FROM run_candidates
      WHERE run_id = ${req.params.id}
      ORDER BY score DESC NULLS LAST
    `;

    return {
      ...run,
      job_profiles: run.jobName ? { name: run.jobName, dept: run.jobDept } : null,
      candidates: candidates.map((c) => formatRunCandidateRow(c as Record<string, unknown>)),
    };
  });

  app.post<{
    Body: {
      job_id: string;
      model_id?: string;
      cv_sources: Array<
        | { type: 'storage'; path: string; name: string }
        | { type: 'recruitee'; applicant_id: string; cv_url: string; name: string }
      >;
    };
  }>(
    '/runs',
    { preHandler: requireRole('recruiter') },
    async (req, reply) => {
      const { job_id, model_id, cv_sources } = req.body;
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

      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const yyyy = String(now.getFullYear());
      const runId = `${dd}${mm}${yyyy}-${Date.now().toString(36)}`;

      await sql`
        INSERT INTO screening_runs (id, workspace_id, job_id, model_used, status, owner_id, cv_count, started_at)
        VALUES (${runId}, ${req.workspaceId}, ${job_id}, ${modelId}, 'in_progress', ${req.userId}, ${cv_sources.length}, NOW())
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
        },
      });

      void processRun(runId, job_id, modelId, cv_sources, req.workspaceId, req.userId).catch(
        async (err) => {
          await sql`
            UPDATE screening_runs SET status = 'failed', error_message = ${String(err)} WHERE id = ${runId}
          `;
          await writeAuditLogDirect({
            workspaceId: req.workspaceId,
            userId: req.userId,
            action: 'run.failed',
            entityType: 'run',
            entityId: runId,
            payload: { job_id, run_id: runId, error: String(err) },
          });
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
  cvSources: Array<{ type: string; path?: string; name: string; applicant_id?: string; cv_url?: string }>,
  workspaceId: string,
  ownerId: string,
) {
  const [keys, criteriaRows] = await Promise.all([
    getWorkspaceKeys(workspaceId),
    sql`SELECT * FROM job_criteria WHERE job_id = ${jobId} AND archived = false`,
  ]);
  const criteria = mapCriterionRows(criteriaRows as Record<string, unknown>[]);

  const scores: number[] = [];
  const scoringErrors: string[] = [];

  for (const source of cvSources) {
    let pdfBuffer: Buffer;
    let storagePath: string | null = null;
    let recruiteeId: string | null = null;

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
      } = await import('../services/recruitee.js');
      const { getRecruiteeCredentials } = await import('../services/workspace.js');
      const creds = await getRecruiteeCredentials(workspaceId);
      recruiteeId = source.applicant_id ?? null;
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
      scoringResult = await scoreCV(
        { cvText: parsed.text, criteria, modelId, candidateName: source.name } satisfies ScoringRequest,
        keys,
      );
    } catch (err) {
      scoringError = err instanceof Error ? err.message : String(err);
      scoringErrors.push(`${source.name}: ${scoringError}`);
      console.error(`[run ${runId}] scoreCV failed for ${source.name}:`, err);
    }

    const summary = scoringResult?.summary
      ?? (scoringError ? `AI scoring failed: ${scoringError}` : null);

    const [candidateRow] = await sql`
      INSERT INTO run_candidates
        (run_id, name, score, confidence, status, summary, parse_warning,
         must_met, nice_met, flag_triggered, score_base, penalty_must, penalty_flag,
         must_total, nice_total, flag_total, criteria_met_pct, must_met_pct, nice_met_pct,
         cv_storage_path, recruitee_applicant_id)
      VALUES (
        ${runId}, ${source.name}, ${scoringResult?.score ?? null},
        ${scoringResult?.confidence ?? null}, ${scoringResult?.status ?? 'review'},
        ${summary}, ${parsed.warning ?? scoringError ?? null},
        ${scoringResult?.must_met ?? 0}, ${scoringResult?.nice_met ?? 0},
        ${scoringResult?.flag_triggered ?? 0},
        ${scoringResult?.base_score ?? null}, ${scoringResult?.must_penalty ?? null},
        ${scoringResult?.flag_penalty ?? null},
        ${scoringResult?.must_total ?? null}, ${scoringResult?.nice_total ?? null},
        ${scoringResult?.flag_total ?? null}, ${scoringResult?.criteria_met_pct ?? null},
        ${scoringResult?.must_met_pct ?? null}, ${scoringResult?.nice_met_pct ?? null},
        ${storagePath}, ${recruiteeId}
      )
      RETURNING id
    `;

    if (candidateRow && scoringResult?.criteria_results?.length) {
      const evals = scoringResult.criteria_results.map((cr: CriterionResult) => ({
        candidate_id: candidateRow.id,
        criterion_id: cr.criterion_id,
        met: cr.met,
        confidence: cr.confidence,
        quote: cr.quote,
        inferred: cr.inferred,
        notes: cr.notes,
      }));
      await sql`INSERT INTO candidate_evaluations ${sql(evals)}`;
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
}
