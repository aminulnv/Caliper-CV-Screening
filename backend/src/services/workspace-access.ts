import { sql } from './db.js';
import type { UserRole } from '../types/index.js';
import { alertInviteAccepted } from './alerting.js';

export type WorkspaceAccessResult =
  | { status: 'active'; workspaceId: string; role: UserRole }
  | { status: 'none' };

const BOOTSTRAP_ADMIN_EMAILS = (process.env.PLATFORM_BOOTSTRAP_ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function isBootstrapAdmin(email: string): boolean {
  return BOOTSTRAP_ADMIN_EMAILS.includes(email.toLowerCase());
}

export async function hasPendingInvite(email: string): Promise<boolean> {
  const [row] = await sql`
    SELECT 1 FROM workspace_invites
    WHERE lower(email) = ${email.toLowerCase()}
      AND accepted_at IS NULL
      AND revoked_at IS NULL
    LIMIT 1
  `;
  return Boolean(row);
}

export async function resolveWorkspaceAccess(
  sub: string,
  email: string,
): Promise<WorkspaceAccessResult> {
  const normalizedEmail = email.toLowerCase();

  let [roleRow] = await sql`
    SELECT workspace_id, role FROM user_roles WHERE user_id = ${sub} LIMIT 1
  `;

  if (roleRow) {
    const workspaceId = (roleRow.workspaceId ?? roleRow.workspace_id) as string;
    return { status: 'active', workspaceId, role: roleRow.role as UserRole };
  }

  const [invite] = await sql`
    SELECT id, workspace_id, role, invited_by FROM workspace_invites
    WHERE lower(email) = ${normalizedEmail}
      AND accepted_at IS NULL
      AND revoked_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (invite) {
    const workspaceId = (invite.workspaceId ?? invite.workspace_id) as string;
    const role = invite.role as UserRole;
    const inviteId = invite.id as string;
    const invitedBy = (invite.invitedBy ?? invite.invited_by) as string;

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO user_roles (user_id, workspace_id, role)
        VALUES (${sub}, ${workspaceId}, ${role})
        ON CONFLICT (user_id, workspace_id) DO NOTHING
      `;
      await tx`
        UPDATE workspace_invites SET accepted_at = NOW() WHERE id = ${inviteId}
      `;
    });

    const [workspace] = await sql`SELECT name FROM workspaces WHERE id = ${workspaceId} LIMIT 1`;
    const [accepter] = await sql`SELECT name FROM users WHERE sub = ${sub} LIMIT 1`;

    void alertInviteAccepted({
      workspaceId,
      inviterUserId: invitedBy,
      workspaceName: (workspace?.name as string) ?? 'Workspace',
      accepterEmail: normalizedEmail,
      accepterName: (accepter?.name as string) ?? null,
    }).catch((err) => console.error('[alert] invite accepted:', err));

    [roleRow] = await sql`
      SELECT workspace_id, role FROM user_roles WHERE user_id = ${sub} LIMIT 1
    `;
    if (roleRow) {
      const wsId = (roleRow.workspaceId ?? roleRow.workspace_id) as string;
      return { status: 'active', workspaceId: wsId, role: roleRow.role as UserRole };
    }
  }

  if (isBootstrapAdmin(normalizedEmail)) {
    const defaultWorkspaceId = process.env.DEFAULT_WORKSPACE_ID?.trim();
    if (defaultWorkspaceId) {
      await sql`
        INSERT INTO user_roles (user_id, workspace_id, role)
        VALUES (${sub}, ${defaultWorkspaceId}, 'admin')
        ON CONFLICT (user_id, workspace_id) DO NOTHING
      `;
      [roleRow] = await sql`
        SELECT workspace_id, role FROM user_roles WHERE user_id = ${sub} LIMIT 1
      `;
      if (roleRow) {
        const wsId = (roleRow.workspaceId ?? roleRow.workspace_id) as string;
        return { status: 'active', workspaceId: wsId, role: roleRow.role as UserRole };
      }
    }
  }

  return { status: 'none' };
}

export async function countWorkspaceAdmins(workspaceId: string): Promise<number> {
  const [row] = await sql`
    SELECT COUNT(*)::int AS count FROM user_roles
    WHERE workspace_id = ${workspaceId} AND role = 'admin'
  `;
  return (row?.count as number) ?? 0;
}

export async function getWorkspaceMaxSeats(workspaceId: string): Promise<number> {
  const [row] = await sql`
    SELECT max_seats FROM workspaces WHERE id = ${workspaceId} LIMIT 1
  `;
  return (row?.maxSeats ?? row?.max_seats ?? 25) as number;
}

export async function countUsedSeats(workspaceId: string): Promise<number> {
  const [memberRow] = await sql`
    SELECT COUNT(*)::int AS count FROM user_roles WHERE workspace_id = ${workspaceId}
  `;
  const [inviteRow] = await sql`
    SELECT COUNT(*)::int AS count FROM workspace_invites
    WHERE workspace_id = ${workspaceId}
      AND accepted_at IS NULL
      AND revoked_at IS NULL
  `;
  return ((memberRow?.count as number) ?? 0) + ((inviteRow?.count as number) ?? 0);
}
