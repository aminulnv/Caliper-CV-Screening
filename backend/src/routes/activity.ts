import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { fetchWorkspaceActivity } from '../services/activity-feed.js';

/**
 * Workspace-wide activity log: every audited action across all jobs, with the
 * job each entry belongs to resolved through its entity relationship (job, run,
 * candidate, or evaluation) so the feed reads with context.
 *
 * Admins see all workspace activity; editors and viewers see only their own.
 */
export async function activityRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get<{ Querystring: { limit?: string } }>(
    '/activity',
    async (req) => {
      const limit = Math.min(300, Math.max(1, Number(req.query.limit ?? 150) || 150));
      const scopeToSelf = req.userRole !== 'admin';

      const entries = await fetchWorkspaceActivity(req.workspaceId, req.userId, {
        limit,
        scopeToUserId: scopeToSelf ? req.userId : undefined,
      });

      return { entries };
    },
  );
}
