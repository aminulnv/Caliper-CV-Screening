import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { writeAuditLog } from '../middleware/audit.js';
import {
  DISPOSITION_VALUES,
  getRunCandidateContext,
  pushCandidateDispositionToRecruitee,
  setCandidateDisposition,
  type DispositionValue,
} from '../services/candidate-disposition.js';

type DispositionBody = {
  disposition: DispositionValue;
  target_stage_id?: string;
  target_stage_name?: string;
  note?: string;
  push_to_recruitee?: boolean;
  requalify?: boolean;
};

function parseDispositionBody(body: DispositionBody) {
  return {
    disposition: body.disposition,
    targetStageId: body.target_stage_id,
    targetStageName: body.target_stage_name,
    note: body.note,
    pushToRecruitee: body.push_to_recruitee,
    requalify: body.requalify,
  };
}

export async function dispositionsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.post<{ Params: { runId: string; id: string }; Body: DispositionBody }>(
    '/runs/:runId/candidates/:id/disposition',
    { preHandler: requireRole('recruiter') },
    async (req, reply) => {
      const { disposition } = req.body;
      if (!disposition || !DISPOSITION_VALUES.includes(disposition)) {
        return reply.status(400).send({ error: 'disposition is required (shortlist, hold, reject, advanced)' });
      }

      const ctx = await getRunCandidateContext(
        req.params.runId,
        req.params.id,
        req.workspaceId,
        req.userId,
      );
      if (!ctx) return reply.status(404).send({ error: 'Candidate not found' });

      const result = await setCandidateDisposition(
        req.params.runId,
        req.params.id,
        req.workspaceId,
        req.userId,
        parseDispositionBody(req.body),
      );
      if (!result.ok) return reply.status(result.status).send({ error: result.error });

      await writeAuditLog({
        req,
        action: 'candidate.disposition_set',
        entityType: 'candidate',
        entityId: req.params.id,
        payload: {
          job_id: ctx.jobId,
          run_id: req.params.runId,
          candidate_name: ctx.name,
          disposition,
          target_stage_id: req.body.target_stage_id ?? null,
          push_to_recruitee: Boolean(req.body.push_to_recruitee),
        },
      });

      if (req.body.push_to_recruitee) {
        await writeAuditLog({
          req,
          action: result.syncStatus === 'synced' ? 'candidate.recruitee_synced' : 'candidate.recruitee_sync_failed',
          entityType: 'candidate',
          entityId: req.params.id,
          payload: {
            job_id: ctx.jobId,
            run_id: req.params.runId,
            candidate_name: ctx.name,
            disposition,
            sync_status: result.syncStatus,
            sync_error: result.syncError,
          },
        });
      }

      return {
        success: true,
        candidate: result.candidate,
        sync_status: result.syncStatus,
        sync_error: result.syncError,
      };
    },
  );

  app.post<{ Params: { runId: string }; Body: DispositionBody & { candidate_ids: string[] } }>(
    '/runs/:runId/candidates/bulk-disposition',
    { preHandler: requireRole('recruiter') },
    async (req, reply) => {
      const { disposition, candidate_ids: candidateIds } = req.body;
      if (!disposition || !DISPOSITION_VALUES.includes(disposition)) {
        return reply.status(400).send({ error: 'disposition is required (shortlist, hold, reject, advanced)' });
      }
      if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
        return reply.status(400).send({ error: 'candidate_ids must be a non-empty array' });
      }
      if (candidateIds.length > 100) {
        return reply.status(400).send({ error: 'Too many candidates (max 100)' });
      }

      const uniqueIds = [...new Set(candidateIds.map(String))];
      const input = parseDispositionBody(req.body);
      const updated = [];
      const errors: Array<{ candidate_id: string; error: string }> = [];

      for (const candidateId of uniqueIds) {
        const ctx = await getRunCandidateContext(
          req.params.runId,
          candidateId,
          req.workspaceId,
          req.userId,
        );
        if (!ctx) {
          errors.push({ candidate_id: candidateId, error: 'Candidate not found' });
          continue;
        }

        const result = await setCandidateDisposition(
          req.params.runId,
          candidateId,
          req.workspaceId,
          req.userId,
          input,
        );
        if (!result.ok) {
          errors.push({ candidate_id: candidateId, error: result.error });
          continue;
        }

        updated.push(result.candidate);

        await writeAuditLog({
          req,
          action: 'candidate.disposition_set',
          entityType: 'candidate',
          entityId: candidateId,
          payload: {
            job_id: ctx.jobId,
            run_id: req.params.runId,
            candidate_name: ctx.name,
            disposition,
            bulk: true,
            push_to_recruitee: Boolean(req.body.push_to_recruitee),
          },
        });

        if (req.body.push_to_recruitee) {
          await writeAuditLog({
            req,
            action:
              result.syncStatus === 'synced'
                ? 'candidate.recruitee_synced'
                : 'candidate.recruitee_sync_failed',
            entityType: 'candidate',
            entityId: candidateId,
            payload: {
              job_id: ctx.jobId,
              run_id: req.params.runId,
              candidate_name: ctx.name,
              disposition,
              bulk: true,
              sync_status: result.syncStatus,
              sync_error: result.syncError,
            },
          });
        }
      }

      return {
        success: errors.length === 0,
        updated_count: updated.length,
        candidates: updated,
        errors,
      };
    },
  );

  app.post<{ Params: { runId: string; id: string } }>(
    '/runs/:runId/candidates/:id/push-recruitee',
    { preHandler: requireRole('recruiter') },
    async (req, reply) => {
      const ctx = await getRunCandidateContext(
        req.params.runId,
        req.params.id,
        req.workspaceId,
        req.userId,
      );
      if (!ctx) return reply.status(404).send({ error: 'Candidate not found' });

      const result = await pushCandidateDispositionToRecruitee(
        req.params.runId,
        req.params.id,
        req.workspaceId,
        req.userId,
      );
      if (!result.ok) return reply.status(result.status).send({ error: result.error });

      await writeAuditLog({
        req,
        action: 'candidate.recruitee_synced',
        entityType: 'candidate',
        entityId: req.params.id,
        payload: {
          job_id: ctx.jobId,
          run_id: req.params.runId,
          candidate_name: ctx.name,
          retry: true,
        },
      });

      return { success: true, candidate: result.candidate };
    },
  );
}
