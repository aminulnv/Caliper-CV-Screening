import type { FastifyInstance } from 'fastify';
import { authenticate, verifyGoogleJwt, upsertUserFromIdentity, NO_WORKSPACE_ACCESS } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { sql } from '../services/db.js';
import {
  resolveWorkspaceAccess,
  countWorkspaceAdmins,
  countUsedSeats,
  getWorkspaceMaxSeats,
} from '../services/workspace-access.js';
import type { UserRole } from '../types/index.js';
import { alertWorkspaceInvite } from '../services/alerting.js';
import { updateMemberBudget, getMemberUsage, topUpMemberCredits, setMemberCreditsUnlimited } from '../services/ai-usage.js';
import type { BudgetStatus } from '../services/ai-usage.js';
import { fetchWorkspaceActivity } from '../services/activity-feed.js';
import { writeAuditLog } from '../middleware/audit.js';

const VALID_ROLES: UserRole[] = ['admin', 'recruiter', 'viewer'];

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatMember(row: Record<string, unknown>, currentUserId: string) {
  const userId = (row.userId ?? row.user_id) as string;
  const budgetRaw = row.aiBudgetUsd ?? row.ai_budget_usd;
  const budget = budgetRaw == null ? null : Number(budgetRaw);
  const spentUsd = Number(row.spentUsd ?? row.spent_usd ?? 0);
  const remainingUsd =
    budget != null ? Math.max(0, Math.round((budget - spentUsd) * 100) / 100) : null;
  let aiStatus: BudgetStatus = 'unlimited';
  if (budget != null && budget > 0) {
    const pct = (spentUsd / budget) * 100;
    if (pct >= 100) aiStatus = 'blocked';
    else if (pct >= 80) aiStatus = 'warn';
    else aiStatus = 'ok';
  }
  return {
    id: (row.id) as string,
    user_id: userId,
    email: (row.email) as string,
    name: (row.name as string | null) ?? null,
    avatar_url: (row.avatarUrl ?? row.avatar_url ?? null) as string | null,
    role: (row.role) as UserRole,
    joined_at: (row.joinedAt ?? row.joined_at ?? row.createdAt ?? row.created_at) as string,
    is_current_user: userId === currentUserId,
    ai_budget_usd: budget,
    ai_spent_usd: spentUsd,
    ai_remaining_usd: remainingUsd,
    ai_status: aiStatus,
  };
}

function formatInvite(row: Record<string, unknown>) {
  return {
    id: (row.id) as string,
    email: (row.email) as string,
    role: (row.role) as UserRole,
    invited_at: (row.invitedAt ?? row.invited_at ?? row.createdAt ?? row.created_at) as string,
    status: 'pending' as const,
  };
}

export async function workspaceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me', async (req, reply) => {
    const identity = await verifyGoogleJwt(req, reply);
    if (!identity) return;

    try {
      await upsertUserFromIdentity(identity);
      const access = await resolveWorkspaceAccess(identity.sub, identity.email);

      if (access.status === 'none') {
        return reply.send({
          access: 'none',
          user: {
            email: identity.email,
            name: identity.name,
          },
        });
      }

      const [workspace] = await sql`
        SELECT id, name FROM workspaces WHERE id = ${access.workspaceId} LIMIT 1
      `;

      return reply.send({
        access: 'active',
        user: {
          sub: identity.sub,
          email: identity.email,
          name: identity.name,
          picture: identity.picture,
        },
        workspace: {
          id: access.workspaceId,
          name: (workspace?.name as string) ?? 'Workspace',
        },
        role: access.role,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[me] database error:', message);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  app.register(async (protectedRoutes) => {
    protectedRoutes.addHook('preHandler', authenticate);

    protectedRoutes.get(
      '/me/profile',
      { preHandler: requireRole('viewer') },
      async (req, reply) => {
        const workspaceId = req.workspaceId;
        const userId = req.userId;

        const [
          [memberRow],
          [statsRow],
          [activity30dRow],
          recentActivity,
          usage,
        ] = await Promise.all([
          sql`
            SELECT ur.created_at AS joined_at,
                   w.id AS workspace_id,
                   w.name AS workspace_name,
                   u.last_seen_at
            FROM user_roles ur
            JOIN users u ON u.sub = ur.user_id
            JOIN workspaces w ON w.id = ur.workspace_id
            WHERE ur.workspace_id = ${workspaceId} AND ur.user_id = ${userId}
            LIMIT 1
          `,
          sql`
            SELECT COUNT(*)::int AS screenings,
                   COALESCE(SUM(cv_count), 0)::int AS cvs_processed,
                   COUNT(DISTINCT job_id)::int AS jobs_screened
            FROM screening_runs
            WHERE workspace_id = ${workspaceId} AND owner_id = ${userId}
          `,
          sql`
            SELECT COUNT(*)::int AS activity_30d
            FROM audit_log
            WHERE workspace_id = ${workspaceId}
              AND user_id = ${userId}
              AND created_at >= NOW() - INTERVAL '30 days'
          `,
          fetchWorkspaceActivity(workspaceId, userId, {
            limit: 8,
            scopeToUserId: userId,
          }),
          req.userRole !== 'viewer'
            ? getMemberUsage(workspaceId, userId)
            : Promise.resolve(null),
        ]);

        if (!memberRow) {
          return reply.status(404).send({ error: 'Member not found.' });
        }

        const joinedAt = (memberRow.joinedAt ?? memberRow.joined_at) as Date | string;
        const lastSeenAt = (memberRow.lastSeenAt ?? memberRow.last_seen_at) as Date | string;

        return reply.send({
          joined_at: joinedAt instanceof Date ? joinedAt.toISOString() : String(joinedAt),
          last_seen_at: lastSeenAt instanceof Date ? lastSeenAt.toISOString() : String(lastSeenAt),
          workspace: {
            id: (memberRow.workspaceId ?? memberRow.workspace_id) as string,
            name: (memberRow.workspaceName ?? memberRow.workspace_name) as string,
          },
          stats: {
            screenings: Number(statsRow?.screenings ?? statsRow?.screenings ?? 0),
            cvs_processed: Number(statsRow?.cvsProcessed ?? statsRow?.cvs_processed ?? 0),
            jobs_screened: Number(statsRow?.jobsScreened ?? statsRow?.jobs_screened ?? 0),
            activity_30d: Number(activity30dRow?.activity30d ?? activity30dRow?.activity_30d ?? 0),
          },
          usage: usage
            ? {
                user_id: usage.user_id,
                email: usage.email,
                name: usage.name,
                role: usage.role,
                budget_usd: usage.budget_usd,
                spent_usd: usage.spent_usd,
                remaining_usd: usage.remaining_usd,
                pct_used: usage.pct_used,
                status: usage.status,
              }
            : undefined,
          recent_activity: recentActivity,
        });
      },
    );

    protectedRoutes.get(
      '/workspace/members',
      { preHandler: requireRole('viewer') },
      async (req, reply) => {
        const workspaceId = req.workspaceId;

        const memberRows = await sql`
          SELECT ur.id, ur.user_id, ur.role, ur.created_at, ur.ai_budget_usd,
                 u.email, u.name, u.avatar_url,
                 COALESCE(spent.total, 0) AS spent_usd
          FROM user_roles ur
          JOIN users u ON u.sub = ur.user_id
          LEFT JOIN LATERAL (
            SELECT SUM(cost_usd) AS total
            FROM ai_usage_events e
            WHERE e.workspace_id = ${workspaceId} AND e.user_id = ur.user_id
          ) spent ON true
          WHERE ur.workspace_id = ${workspaceId}
          ORDER BY ur.created_at ASC
        `;

        const inviteRows = await sql`
          SELECT id, email, role, created_at
          FROM workspace_invites
          WHERE workspace_id = ${workspaceId}
            AND accepted_at IS NULL
            AND revoked_at IS NULL
          ORDER BY created_at ASC
        `;

        const maxSeats = await getWorkspaceMaxSeats(workspaceId);
        const usedSeats = await countUsedSeats(workspaceId);

        return reply.send({
          members: memberRows.map((row) => formatMember(row as Record<string, unknown>, req.userId)),
          pending_invites: inviteRows.map((row) => formatInvite(row as Record<string, unknown>)),
          seats: { used: usedSeats, max: maxSeats },
        });
      },
    );

    protectedRoutes.post(
      '/workspace/invites',
      { preHandler: requireRole('admin') },
      async (req, reply) => {
        const body = req.body as { email?: string; role?: string };
        const email = normalizeEmail(body.email ?? '');
        const role = body.role as UserRole;

        if (!email || !isValidEmail(email)) {
          return reply.status(400).send({ error: 'A valid email address is required.' });
        }
        if (!VALID_ROLES.includes(role)) {
          return reply.status(400).send({ error: 'Role must be viewer, recruiter, or admin.' });
        }

        const workspaceId = req.workspaceId;

        const [existingMember] = await sql`
          SELECT ur.id FROM user_roles ur
          JOIN users u ON u.sub = ur.user_id
          WHERE ur.workspace_id = ${workspaceId} AND lower(u.email) = ${email}
          LIMIT 1
        `;
        if (existingMember) {
          return reply.status(409).send({ error: 'This person is already a member of the workspace.' });
        }

        const maxSeats = await getWorkspaceMaxSeats(workspaceId);
        const usedSeats = await countUsedSeats(workspaceId);

        const [existingInvite] = await sql`
          SELECT id FROM workspace_invites
          WHERE workspace_id = ${workspaceId}
            AND lower(email) = ${email}
            AND accepted_at IS NULL
            AND revoked_at IS NULL
          LIMIT 1
        `;

        if (!existingInvite && usedSeats >= maxSeats) {
          return reply.status(409).send({ error: `Seat limit reached (${maxSeats} seats).` });
        }

        if (existingInvite) {
          await sql`
            UPDATE workspace_invites
            SET role = ${role}, invited_by = ${req.userId}, created_at = NOW(), revoked_at = NULL
            WHERE id = ${existingInvite.id as string}
          `;
        } else {
          await sql`
            INSERT INTO workspace_invites (workspace_id, email, role, invited_by)
            VALUES (${workspaceId}, ${email}, ${role}, ${req.userId})
            ON CONFLICT (workspace_id, email) DO UPDATE
            SET role = EXCLUDED.role,
                invited_by = EXCLUDED.invited_by,
                created_at = NOW(),
                accepted_at = NULL,
                revoked_at = NULL
          `;
        }

        const [workspace] = await sql`SELECT name FROM workspaces WHERE id = ${workspaceId} LIMIT 1`;
        const [inviter] = await sql`SELECT name, email FROM users WHERE sub = ${req.userId} LIMIT 1`;

        void alertWorkspaceInvite({
          inviteeEmail: email,
          workspaceName: (workspace?.name as string) ?? 'Caliper',
          role,
          inviterName: (inviter?.name as string) ?? null,
          inviterEmail: (inviter?.email as string) ?? null,
        }).catch((err) => console.error('[alert] workspace invite:', err));

        return reply.send({ success: true, updated: Boolean(existingInvite) });
      },
    );

    protectedRoutes.patch(
      '/workspace/members/:id',
      { preHandler: requireRole('admin') },
      async (req, reply) => {
        const { id } = req.params as { id: string };
        const body = req.body as { role?: string };
        const role = body.role as UserRole;

        if (!VALID_ROLES.includes(role)) {
          return reply.status(400).send({ error: 'Role must be viewer, recruiter, or admin.' });
        }

        const workspaceId = req.workspaceId;

        const [member] = await sql`
          SELECT id, user_id, role FROM user_roles
          WHERE id = ${id} AND workspace_id = ${workspaceId}
          LIMIT 1
        `;
        if (!member) {
          return reply.status(404).send({ error: 'Member not found.' });
        }

        const memberUserId = (member.userId ?? member.user_id) as string;
        const currentRole = member.role as UserRole;

        if (currentRole === 'admin' && role !== 'admin') {
          const adminCount = await countWorkspaceAdmins(workspaceId);
          if (adminCount <= 1) {
            return reply.status(409).send({ error: 'Cannot change the role of the last admin.' });
          }
        }

        await sql`
          UPDATE user_roles SET role = ${role}
          WHERE id = ${id} AND workspace_id = ${workspaceId}
        `;

        return reply.send({ success: true, user_id: memberUserId, role });
      },
    );

    protectedRoutes.put(
      '/workspace/members/:id/budget',
      { preHandler: requireRole('admin') },
      async (req, reply) => {
        const { id } = req.params as { id: string };
        const body = req.body as { ai_budget_usd?: number | null };
        const workspaceId = req.workspaceId;

        if (body.ai_budget_usd != null) {
          return reply.status(400).send({
            error: 'Use POST /workspace/members/:id/credits/top-up to add credits. Send null only to set unlimited.',
          });
        }

        try {
          await updateMemberBudget(workspaceId, id, null);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not update credits.';
          return reply.status(400).send({ error: message });
        }

        const [member] = await sql`
          SELECT ur.user_id FROM user_roles ur
          WHERE ur.id = ${id} AND ur.workspace_id = ${workspaceId}
          LIMIT 1
        `;
        if (!member) return reply.status(404).send({ error: 'Member not found.' });

        const usage = await getMemberUsage(
          workspaceId,
          (member.userId ?? member.user_id) as string,
        );

        return reply.send({
          success: true,
          ai_budget_usd: usage.budget_usd,
          ai_spent_usd: usage.spent_usd,
          ai_remaining_usd: usage.remaining_usd,
          ai_status: usage.status,
        });
      },
    );

    protectedRoutes.post(
      '/workspace/members/:id/credits/top-up',
      { preHandler: requireRole('admin') },
      async (req, reply) => {
        const { id } = req.params as { id: string };
        const body = req.body as { amount_usd?: number };
        const workspaceId = req.workspaceId;
        const amount = Number(body.amount_usd);
        if (!Number.isFinite(amount) || amount <= 0) {
          return reply.status(400).send({ error: 'amount_usd must be a positive number.' });
        }

        try {
          const topUp = await topUpMemberCredits(workspaceId, id, amount);
          const [member] = await sql`
            SELECT ur.user_id FROM user_roles ur
            WHERE ur.id = ${id} AND ur.workspace_id = ${workspaceId}
            LIMIT 1
          `;
          if (!member) return reply.status(404).send({ error: 'Member not found.' });

          const memberUserId = (member.userId ?? member.user_id) as string;
          const usage = await getMemberUsage(workspaceId, memberUserId);

          await writeAuditLog({
            req,
            action: 'member.credits_topup',
            entityType: 'member',
            entityId: memberUserId,
            payload: {
              amount_usd: amount,
              previous_budget_usd: topUp.previous_budget_usd,
              new_budget_usd: topUp.new_budget_usd,
              member_email: usage.email,
            },
          });

          return reply.send({
            success: true,
            amount_usd: amount,
            ai_budget_usd: usage.budget_usd,
            ai_spent_usd: usage.spent_usd,
            ai_remaining_usd: usage.remaining_usd,
            ai_status: usage.status,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not add credits.';
          return reply.status(400).send({ error: message });
        }
      },
    );

    protectedRoutes.post(
      '/workspace/members/:id/credits/unlimited',
      { preHandler: requireRole('admin') },
      async (req, reply) => {
        const { id } = req.params as { id: string };
        const workspaceId = req.workspaceId;

        try {
          await setMemberCreditsUnlimited(workspaceId, id);
          const [member] = await sql`
            SELECT ur.user_id FROM user_roles ur
            WHERE ur.id = ${id} AND ur.workspace_id = ${workspaceId}
            LIMIT 1
          `;
          if (!member) return reply.status(404).send({ error: 'Member not found.' });

          const memberUserId = (member.userId ?? member.user_id) as string;
          const usage = await getMemberUsage(workspaceId, memberUserId);

          await writeAuditLog({
            req,
            action: 'member.credits_unlimited',
            entityType: 'member',
            entityId: memberUserId,
            payload: { member_email: usage.email },
          });

          return reply.send({
            success: true,
            ai_budget_usd: usage.budget_usd,
            ai_spent_usd: usage.spent_usd,
            ai_remaining_usd: usage.remaining_usd,
            ai_status: usage.status,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not set unlimited credits.';
          return reply.status(400).send({ error: message });
        }
      },
    );

    protectedRoutes.delete(
      '/workspace/members/:id',
      { preHandler: requireRole('admin') },
      async (req, reply) => {
        const { id } = req.params as { id: string };
        const workspaceId = req.workspaceId;

        const [member] = await sql`
          SELECT id, user_id, role FROM user_roles
          WHERE id = ${id} AND workspace_id = ${workspaceId}
          LIMIT 1
        `;
        if (!member) {
          return reply.status(404).send({ error: 'Member not found.' });
        }

        const memberRole = member.role as UserRole;
        if (memberRole === 'admin') {
          const adminCount = await countWorkspaceAdmins(workspaceId);
          if (adminCount <= 1) {
            return reply.status(409).send({ error: 'Cannot remove the last admin.' });
          }
        }

        await sql`DELETE FROM user_roles WHERE id = ${id} AND workspace_id = ${workspaceId}`;
        return reply.send({ success: true });
      },
    );

    protectedRoutes.delete(
      '/workspace/invites/:id',
      { preHandler: requireRole('admin') },
      async (req, reply) => {
        const { id } = req.params as { id: string };
        const workspaceId = req.workspaceId;

        const [invite] = await sql`
          SELECT id FROM workspace_invites
          WHERE id = ${id}
            AND workspace_id = ${workspaceId}
            AND accepted_at IS NULL
            AND revoked_at IS NULL
          LIMIT 1
        `;
        if (!invite) {
          return reply.status(404).send({ error: 'Invite not found.' });
        }

        await sql`
          UPDATE workspace_invites SET revoked_at = NOW() WHERE id = ${id}
        `;
        return reply.send({ success: true });
      },
    );
  });
}

export { NO_WORKSPACE_ACCESS };
