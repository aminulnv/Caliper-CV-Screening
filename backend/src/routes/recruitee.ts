import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import {
  fetchRecruiteeJobs,
  fetchRecruiteeApplicants,
  fetchRecruiteeCandidateCv,
} from '../services/recruitee.js';
import { syncRecruiteeJobs } from '../services/recruitee-sync.js';
import { getRecruiteeCredentials } from '../services/workspace.js';

export async function recruiteeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.post(
    '/recruitee/sync-jobs',
    { preHandler: requireRole('recruiter') },
    async (req, reply) => {
      try {
        const result = await syncRecruiteeJobs(req.workspaceId, req.userId);
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes('not configured')) {
          return reply.status(400).send({ error: message });
        }
        return reply.status(400).send({ error: `Recruitee sync failed: ${message}` });
      }
    },
  );

  // GET /recruitee/jobs
  app.get('/recruitee/jobs', { preHandler: requireRole('recruiter') }, async (req, reply) => {
    const creds = await getRecruiteeCredentials(req.workspaceId).catch(() => null);
    if (!creds) return reply.status(400).send({ error: 'Recruitee not configured' });

    const jobs = await fetchRecruiteeJobs(creds.baseUrl, creds.apiKey);
    return jobs;
  });

  // GET /recruitee/jobs/:jobId/applicants
  app.get<{ Params: { jobId: string } }>(
    '/recruitee/jobs/:jobId/applicants',
    { preHandler: requireRole('viewer') },
    async (req, reply) => {
      const creds = await getRecruiteeCredentials(req.workspaceId).catch(() => null);
      if (!creds) return reply.status(400).send({ error: 'Recruitee not configured' });

      const applicants = await fetchRecruiteeApplicants(creds.baseUrl, creds.apiKey, req.params.jobId);
      return applicants;
    },
  );

  app.get<{ Params: { candidateId: string } }>(
    '/recruitee/candidates/:candidateId/cv',
    { preHandler: requireRole('viewer') },
    async (req, reply) => {
      const creds = await getRecruiteeCredentials(req.workspaceId).catch(() => null);
      if (!creds) return reply.status(400).send({ error: 'Recruitee not configured' });

      try {
        const { buffer, filename } = await fetchRecruiteeCandidateCv(
          creds.baseUrl,
          creds.apiKey,
          req.params.candidateId,
        );
        return reply
          .header('Content-Type', 'application/pdf')
          .header('Content-Disposition', `inline; filename="${filename.replace(/"/g, '')}"`)
          .send(buffer);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes('not found') || message.includes('No CV')) {
          return reply.status(404).send({ error: message });
        }
        return reply.status(400).send({ error: message });
      }
    },
  );
}
