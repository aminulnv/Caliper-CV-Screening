import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import {
  estimateUsage,
  getMemberUsage,
  getMemberMonthlyUsage,
  getRecentUsageEvents,
  getWorkspaceMonthlyUsage,
  getWorkspaceUsageSummary,
} from '../services/ai-usage.js';

export async function usageRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get(
    '/usage',
    { preHandler: requireRole('recruiter') },
    async (req) => {
      const [self, recent_events, monthly] = await Promise.all([
        getMemberUsage(req.workspaceId, req.userId),
        getRecentUsageEvents(req.workspaceId, req.userId),
        getMemberMonthlyUsage(req.workspaceId, req.userId),
      ]);

      if (req.userRole === 'admin') {
        const [members, team_monthly] = await Promise.all([
          getWorkspaceUsageSummary(req.workspaceId),
          getWorkspaceMonthlyUsage(req.workspaceId),
        ]);
        const totals = {
          budget_usd: members.reduce((sum, m) => sum + (m.budget_usd ?? 0), 0),
          spent_usd: members.reduce((sum, m) => sum + m.spent_usd, 0),
        };
        return { self, recent_events, monthly, members, totals, team_monthly };
      }

      return { self, recent_events, monthly };
    },
  );

  app.get<{
    Querystring: { month?: string; limit?: string };
  }>(
    '/usage/events',
    { preHandler: requireRole('recruiter') },
    async (req) => {
      const month = req.query.month?.trim() || null;
      const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50) || 50));
      const events = await getRecentUsageEvents(
        req.workspaceId,
        req.userId,
        limit,
        month,
      );
      return { events };
    },
  );

  app.get<{
    Querystring: { cv_count?: string; criteria_count?: string; model?: string };
  }>(
    '/usage/estimate',
    { preHandler: requireRole('recruiter') },
    async (req) => {
      const cvCount = Math.max(0, Number(req.query.cv_count ?? 0) || 0);
      const criteriaCount = Math.max(0, Number(req.query.criteria_count ?? 0) || 0);
      const modelId = req.query.model?.trim() || 'claude-sonnet-4-6';

      const member = await getMemberUsage(req.workspaceId, req.userId);
      const estimate = estimateUsage({
        modelId,
        cvCount,
        criteriaCount,
        spentUsd: member.spent_usd,
        budgetUsd: member.budget_usd,
      });

      return estimate;
    },
  );
}
