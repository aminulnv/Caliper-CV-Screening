import type { FastifyRequest } from 'fastify';
import { sql } from '../services/db.js';

interface AuditParams {
  req: FastifyRequest;
  action: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
}

export async function writeAuditLog({ req, action, entityType, entityId, payload }: AuditParams) {
  const ip = req.headers['x-forwarded-for']?.toString() ?? req.ip;
  await writeAuditLogDirect({
    workspaceId: req.workspaceId,
    userId: req.userId,
    action,
    entityType,
    entityId,
    payload,
    ip,
  });
}

export async function writeAuditLogDirect(params: {
  workspaceId: string;
  userId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
  ip?: string | null;
}): Promise<void> {
  const { workspaceId, userId, action, entityType, entityId, payload, ip } = params;
  await sql`
    INSERT INTO audit_log (workspace_id, user_id, action, entity_type, entity_id, payload, ip)
    VALUES (
      ${workspaceId}, ${userId}, ${action},
      ${entityType ?? null}, ${entityId ?? null},
      ${payload ? JSON.stringify(payload) : null},
      ${ip ?? null}
    )
  `;
}
