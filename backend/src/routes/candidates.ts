import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { writeAuditLog } from '../middleware/audit.js';
import { sql } from '../services/db.js';
import { storage } from '../services/storage.js';
import { fetchRecruiteeCandidateCv } from '../services/recruitee.js';
import { getRecruiteeCredentials } from '../services/workspace.js';
import { isWorkspaceStoragePath } from '../lib/storage-path.js';

export async function candidatesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get<{ Params: { id: string } }>('/candidates/:id/evaluation', async (req, reply) => {
    const [candidate] = await sql`
      SELECT rc.id, rc.run_id, rc.name, rc.title, rc.location, rc.score, rc.confidence,
             rc.status, rc.summary, rc.parse_warning, rc.must_met, rc.nice_met, rc.flag_triggered,
             rc.score_base, rc.penalty_must, rc.penalty_flag,
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
             ce.overridden_by, ce.override_note, ce.created_at,
             jc.kind, jc.name AS criterion_name, jc.weight, jc.biased
      FROM candidate_evaluations ce
      LEFT JOIN job_criteria jc ON ce.criterion_id = jc.id
      WHERE ce.candidate_id = ${req.params.id}
    `;

    const cvStoragePath = (candidate.cvStoragePath ?? candidate.cv_storage_path) as string | null;
    const recruiteeApplicantId = (candidate.recruiteeApplicantId ?? candidate.recruitee_applicant_id) as
      | string
      | null;

    return {
      candidate: {
        ...candidate,
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
        SET met = ${met}, overridden_by = ${req.userId}, override_note = ${override_note ?? null}
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
          met,
          override_note,
        },
      });

      return { success: true };
    },
  );
}
