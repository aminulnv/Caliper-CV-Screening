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

const VALID_ROLES: UserRole[] = ['admin', 'recruiter', 'viewer'];

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatMember(row: Record<string, unknown>, currentUserId: string) {
  const userId = (row.userId ?? row.user_id) as string;
  return {
    id: (row.id) as string,
    user_id: userId,
    email: (row.email) as string,
    name: (row.name as string | null) ?? null,
    avatar_url: (row.avatarUrl ?? row.avatar_url ?? null) as string | null,
    role: (row.role) as UserRole,
    joined_at: (row.joinedAt ?? row.joined_at ?? row.createdAt ?? row.created_at) as string,
    is_current_user: userId === currentUserId,
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
      '/workspace/members',
      { preHandler: requireRole('viewer') },
      async (req, reply) => {
        const workspaceId = req.workspaceId;

        const memberRows = await sql`
          SELECT ur.id, ur.user_id, ur.role, ur.created_at,
                 u.email, u.name, u.avatar_url
          FROM user_roles ur
          JOIN users u ON u.sub = ur.user_id
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
          return reply.send({ success: true, updated: true });
        }

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

        return reply.send({ success: true });
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
