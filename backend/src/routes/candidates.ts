import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { writeAuditLog } from '../middleware/audit.js';
import { sql } from '../services/db.js';
import { storage } from '../services/storage.js';
import { fetchRecruiteeCandidateCv } from '../services/recruitee.js';
import { getRecruiteeCredentials, getWorkspaceSettings } from '../services/workspace.js';
import { isWorkspaceStoragePath } from '../lib/storage-path.js';
import { formatRunCandidateRow } from '../lib/run-candidate-format.js';
import { computeScore, mapEvaluationToScoringInput } from '../services/scoring.js';
import { mapCriterionRows } from '../services/screening-model.js';

async function recomputeRunScoreRange(runId: string): Promise<number[] | null> {
  const rows = await sql`
    SELECT score FROM run_candidates
    WHERE run_id = ${runId} AND score IS NOT NULL
  `;
  const scores = rows.map((r) => Number(r.score)).filter((n) => !Number.isNaN(n));
  const scoreRange = scores.length ? [Math.min(...scores), Math.max(...scores)] : null;
  await sql`UPDATE screening_runs SET score_range = ${scoreRange} WHERE id = ${runId}`;
  return scoreRange;
}

async function recalculateCandidateScore(candidateId: string, workspaceId: string) {
  const [candidateRow] = await sql`
    SELECT rc.id, rc.run_id, sr.job_id, rc.cv_quality_score
    FROM run_candidates rc
    JOIN screening_runs sr ON rc.run_id = sr.id
    WHERE rc.id = ${candidateId} AND sr.workspace_id = ${workspaceId}
  `;
  if (!candidateRow) return null;

  const runId = candidateRow.runId as string;
  const jobId = candidateRow.jobId as string;
  const cvQualityScore = (candidateRow.cvQualityScore ?? candidateRow.cv_quality_score) as number | null;

  const [criteriaRows, evalRows, settings] = await Promise.all([
    sql`SELECT * FROM job_criteria WHERE job_id = ${jobId} AND archived = false`,
    sql`
      SELECT ce.criterion_id, ce.met, ce.confidence, ce.overridden_by
      FROM candidate_evaluations ce
      WHERE ce.candidate_id = ${candidateId}
    `,
    getWorkspaceSettings(workspaceId),
  ]);

  const criteria = mapCriterionRows(criteriaRows as Record<string, unknown>[]);
  const scoringInputs = (evalRows as Array<Record<string, unknown>>).map((row) =>
    mapEvaluationToScoringInput({
      criterion_id: row.criterionId as string ?? row.criterion_id as string,
      met: row.met as boolean | null,
      confidence: (row.confidence as string | null) ?? null,
      overridden_by: (row.overriddenBy as string | null) ?? (row.overridden_by as string | null),
    }),
  );

  const breakdown = computeScore(
    criteria,
    scoringInputs,
    settings.confidence_threshold,
    cvQualityScore,
  );

  const [updated] = await sql`
    UPDATE run_candidates
    SET score = ${breakdown.score},
        confidence = ${breakdown.confidence},
        status = ${breakdown.status},
        must_met = ${breakdown.must_met},
        nice_met = ${breakdown.nice_met},
        flag_triggered = ${breakdown.flag_triggered},
        score_base = ${breakdown.base_score},
        penalty_flag = ${breakdown.flag_penalty},
        quality_adjustment = ${breakdown.quality_adjustment},
        must_total = ${breakdown.must_total},
        nice_total = ${breakdown.nice_total},
        flag_total = ${breakdown.flag_total},
        criteria_met_pct = ${breakdown.criteria_met_pct},
        must_met_pct = ${breakdown.must_met_pct},
        nice_met_pct = ${breakdown.nice_met_pct}
    WHERE id = ${candidateId}
    RETURNING id, name, title, location, score, confidence, status, summary,
              parse_warning, must_met, nice_met, flag_triggered,
              score_base, penalty_flag, cv_quality_score, quality_adjustment,
              must_total, nice_total, flag_total,
              criteria_met_pct, must_met_pct, nice_met_pct,
              cv_storage_path, recruitee_applicant_id, run_id
  `;

  const scoreRange = await recomputeRunScoreRange(runId);

  return {
    candidate: formatRunCandidateRow(updated as Record<string, unknown>),
    score_range: scoreRange,
  };
}

export async function candidatesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get<{ Params: { id: string } }>('/candidates/:id/evaluation', async (req, reply) => {
    const [candidate] = await sql`
      SELECT rc.id, rc.run_id, rc.name, rc.title, rc.location, rc.score, rc.confidence,
             rc.status, rc.summary, rc.parse_warning, rc.must_met, rc.nice_met, rc.flag_triggered,
             rc.score_base, rc.penalty_flag,
             rc.must_total, rc.nice_total, rc.flag_total,
             rc.criteria_met_pct, rc.must_met_pct, rc.nice_met_pct,
             rc.cv_storage_path, rc.recruitee_applicant_id
      FROM run_candidates rc
      JOIN screening_runs sr ON rc.run_id = sr.id
      WHERE rc.id = ${req.params.id} AND sr.workspace_id = ${req.workspaceId}
    `;
    if (!candidate) return reply.status(404).send({ error: 'Candidate not found' });

    const evaluations = await sql`
      SELECT ce.id, ce.criterion_id, ce.met, ce.confidence, ce.quote, ce.inferred, ce.notes,
             ce.overridden_by, ce.override_note, ce.agreed_by, ce.agreed_at, ce.created_at,
             jc.kind, jc.name AS criterion_name, jc.weight, jc.biased
      FROM candidate_evaluations ce
      LEFT JOIN job_criteria jc ON ce.criterion_id = jc.id
      WHERE ce.candidate_id = ${req.params.id}
    `;

    const formatted = formatRunCandidateRow(candidate as Record<string, unknown>);
    const cvStoragePath = formatted.cv_storage_path;
    const recruiteeApplicantId = formatted.recruitee_applicant_id;

    return {
      candidate: {
        ...formatted,
        has_cv: Boolean(cvStoragePath || recruiteeApplicantId),
      },
      evaluations: evaluations.map((e) => ({
        ...e,
        job_criteria: e.kind != null ? {
          kind: e.kind,
          name: e.criterionName,
          weight: e.weight,
          biased: e.biased,
        } : null,
      })),
    };
  });

  app.get<{ Params: { id: string } }>('/candidates/:id/cv', async (req, reply) => {
    const [row] = await sql`
      SELECT rc.cv_storage_path, rc.recruitee_applicant_id, rc.name,
             sr.workspace_id, jp.source
      FROM run_candidates rc
      JOIN screening_runs sr ON rc.run_id = sr.id
      LEFT JOIN job_profiles jp ON sr.job_id = jp.id
      WHERE rc.id = ${req.params.id} AND sr.workspace_id = ${req.workspaceId}
    `;
    if (!row) return reply.status(404).send({ error: 'Candidate not found' });

    const storagePath = (row.cvStoragePath ?? row.cv_storage_path) as string | null;
    const recruiteeId = (row.recruiteeApplicantId ?? row.recruitee_applicant_id) as string | null;
    const jobSource = (row.source as string | null) ?? '';

    let pdf: Buffer;
    let filename: string;

    if (storagePath) {
      if (!isWorkspaceStoragePath(storagePath, req.workspaceId)) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      pdf = await storage.download(storagePath);
      filename = `${(row.name as string) ?? 'candidate'}.pdf`;
    } else if (recruiteeId && jobSource === 'recruitee') {
      try {
        const creds = await getRecruiteeCredentials(req.workspaceId);
        const fetched = await fetchRecruiteeCandidateCv(creds.baseUrl, creds.apiKey, recruiteeId);
        pdf = fetched.buffer;
        filename = fetched.filename;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not load CV from Recruitee';
        return reply.status(404).send({ error: message });
      }
    } else {
      return reply.status(404).send({ error: 'No CV available for this candidate' });
    }

    const safeName = filename.replace(/[^\w\s.-]/g, '').trim() || 'cv.pdf';
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${safeName}"`)
      .send(pdf);
  });

  app.get<{ Params: { id: string } }>('/candidates/:id/history', async (req, reply) => {
    const [current] = await sql`
      SELECT rc.id, rc.applicant_email, rc.recruitee_applicant_id, rc.run_id,
             sr.owner_id
      FROM run_candidates rc
      JOIN screening_runs sr ON rc.run_id = sr.id
      WHERE rc.id = ${req.params.id} AND sr.workspace_id = ${req.workspaceId}
    `;
    if (!current) return reply.status(404).send({ error: 'Candidate not found' });

    const ownerId = (current.ownerId ?? current.owner_id) as string;
    const runId = (current.runId ?? current.run_id) as string;
    const canSeeCurrent =
      ownerId === req.userId
      || (await sql`
          SELECT 1 FROM run_shares
          WHERE run_id = ${runId} AND user_id = ${req.userId}
          LIMIT 1
        `).length > 0;
    if (!canSeeCurrent) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const email = ((current.applicantEmail ?? current.applicant_email) as string | null)?.trim().toLowerCase() ?? null;
    const recruiteeId = (current.recruiteeApplicantId ?? current.recruitee_applicant_id) as string | null;

    if (!email && !recruiteeId) {
      return { matched_by: null, history: [] };
    }

    const historyRows = await sql`
      SELECT rc.id, rc.run_id, rc.score, rc.status, rc.created_at,
             jp.id AS job_id, jp.name AS job_name
      FROM run_candidates rc
      JOIN screening_runs sr ON rc.run_id = sr.id
      JOIN job_profiles jp ON sr.job_id = jp.id
      WHERE rc.id != ${req.params.id}
        AND sr.workspace_id = ${req.workspaceId}
        AND (
          (${email}::text IS NOT NULL AND lower(rc.applicant_email) = ${email})
          OR (${recruiteeId}::text IS NOT NULL AND rc.recruitee_applicant_id = ${recruiteeId})
        )
        AND (
          sr.owner_id = ${req.userId}
          OR EXISTS (
            SELECT 1 FROM run_shares rs
            WHERE rs.run_id = sr.id AND rs.user_id = ${req.userId}
          )
        )
      ORDER BY rc.created_at DESC
      LIMIT 20
    `;

    const matchedBy = email ? 'email' : recruiteeId ? 'recruitee_id' : null;

    return {
      matched_by: matchedBy,
      history: historyRows.map((r) => ({
        candidate_id: r.id as string,
        run_id: (r.runId ?? r.run_id) as string,
        job_id: (r.jobId ?? r.job_id) as string,
        job_name: (r.jobName ?? r.job_name) as string,
        score: r.score != null ? Number(r.score) : null,
        status: (r.status as string | null) ?? null,
        screened_at: (r.createdAt ?? r.created_at) as string,
      })),
    };
  });

  app.patch<{
    Params: { id: string };
    Body: { met: boolean; override_note: string };
  }>(
    '/evaluations/:id/override',
    { preHandler: requireRole('recruiter') },
    async (req, reply) => {
      const { met, override_note } = req.body;
      if (typeof met !== 'boolean') {
        return reply.status(400).send({ error: 'met (boolean) is required' });
      }

      const [evalRow] = await sql`
        SELECT ce.id, ce.candidate_id, ce.met, ce.ai_met,
               jc.name AS criterion_name, rc.name AS candidate_name,
               sr.id AS run_id, sr.job_id
        FROM candidate_evaluations ce
        JOIN run_candidates rc ON ce.candidate_id = rc.id
        JOIN screening_runs sr ON rc.run_id = sr.id
        LEFT JOIN job_criteria jc ON ce.criterion_id = jc.id
        WHERE ce.id = ${req.params.id} AND sr.workspace_id = ${req.workspaceId}
      `;
      if (!evalRow) return reply.status(404).send({ error: 'Evaluation not found' });

      const aiMet = (evalRow.aiMet ?? evalRow.ai_met) as boolean | null;
      const preservedAiMet = aiMet ?? (evalRow.met as boolean | null);

      await sql`
        UPDATE candidate_evaluations
        SET met = ${met},
            ai_met = COALESCE(ai_met, ${preservedAiMet}),
            overridden_by = ${req.userId},
            override_note = ${override_note ?? null},
            agreed_by = NULL,
            agreed_at = NULL
        WHERE id = ${req.params.id}
      `;

      await writeAuditLog({
        req,
        action: 'evaluation.override',
        entityType: 'evaluation',
        entityId: req.params.id,
        payload: {
          job_id: evalRow.jobId as string,
          run_id: evalRow.runId as string,
          candidate_name: evalRow.candidateName as string,
          criterion_name: evalRow.criterionName as string,
          ai_met: preservedAiMet,
          recruiter_met: met,
          met,
          override_note,
        },
      });

      const recalculated = await recalculateCandidateScore(
        evalRow.candidateId as string,
        req.workspaceId,
      );

      return {
        success: true,
        candidate: recalculated?.candidate ?? null,
        score_range: recalculated?.score_range ?? null,
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/evaluations/:id/agree',
    { preHandler: requireRole('recruiter') },
    async (req, reply) => {
      const [evalRow] = await sql`
        SELECT ce.id, jc.name AS criterion_name, rc.name AS candidate_name,
               sr.id AS run_id, sr.job_id
        FROM candidate_evaluations ce
        JOIN run_candidates rc ON ce.candidate_id = rc.id
        JOIN screening_runs sr ON rc.run_id = sr.id
        LEFT JOIN job_criteria jc ON ce.criterion_id = jc.id
        WHERE ce.id = ${req.params.id} AND sr.workspace_id = ${req.workspaceId}
      `;
      if (!evalRow) return reply.status(404).send({ error: 'Evaluation not found' });

      await sql`
        UPDATE candidate_evaluations
        SET agreed_by = ${req.userId}, agreed_at = NOW()
        WHERE id = ${req.params.id}
      `;

      await writeAuditLog({
        req,
        action: 'evaluation.agree',
        entityType: 'evaluation',
        entityId: req.params.id,
        payload: {
          job_id: evalRow.jobId as string,
          run_id: evalRow.runId as string,
          candidate_name: evalRow.candidateName as string,
          criterion_name: evalRow.criterionName as string,
        },
      });

      return { success: true };
    },
  );
}
