import type { FastifyRequest, FastifyReply } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { sql } from '../services/db.js';
import type { UserRole } from '../types/index.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    userEmail: string;
    workspaceId: string;
    userRole: UserRole;
  }
}

const REGION = process.env.AWS_REGION ?? 'ap-south-1';
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;
const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`;

const DEFAULT_USER_ROLE: UserRole = 'recruiter';

const ALLOWED_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS ?? 'nextventures.io,wearenext.io,fn.com')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

// Cached JWKS fetcher — jose handles cache + rotation automatically
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Cognito ID tokens may omit `email`; federated usernames are often not emails. */
function resolveEmailFromPayload(payload: Record<string, unknown>): string | undefined {
  const candidates = [
    payload.email,
    payload['custom:email'],
    payload.preferred_username,
    payload['cognito:username'],
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && looksLikeEmail(value)) {
      return value.toLowerCase();
    }
  }

  return undefined;
}

function isAllowedEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return ALLOWED_DOMAINS.includes(domain ?? '');
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice(7);

  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(token, JWKS, { issuer: ISSUER });
    payload = result.payload as Record<string, unknown>;
  } catch (err) {
    console.log('[auth] JWT verify failed:', err);
    reply.status(401).send({ error: 'Unauthorized' });
    return;
  }

  const sub = payload.sub as string;
  const email = resolveEmailFromPayload(payload);

  if (!sub || !email) {
    reply.status(401).send({
      error:
        'Sign-in token is missing a verified email. Sign out, sign in again with Google, or contact an admin to fix Cognito email mapping.',
    });
    return;
  }

  if (!isAllowedEmail(email)) {
    const domain = email.split('@')[1];
    reply.status(403).send({
      error: `Access restricted to company accounts (@${domain} is not allowed)`,
    });
    return;
  }

  try {
    await sql`
      INSERT INTO users (sub, email, name)
      VALUES (${sub}, ${email}, ${(payload.name as string) ?? email})
      ON CONFLICT (sub) DO UPDATE SET email = EXCLUDED.email, last_seen_at = NOW()
    `;

    let [roleRow] = await sql`
      SELECT workspace_id, role FROM user_roles WHERE user_id = ${sub} LIMIT 1
    `;

    if (!roleRow) {
      const defaultWorkspaceId = process.env.DEFAULT_WORKSPACE_ID;
      if (!defaultWorkspaceId) {
        reply.status(403).send({ error: 'No workspace configured' });
        return;
      }
      await sql`
        INSERT INTO user_roles (user_id, workspace_id, role)
        VALUES (${sub}, ${defaultWorkspaceId}, ${DEFAULT_USER_ROLE})
        ON CONFLICT DO NOTHING
      `;
      [roleRow] = await sql`
        SELECT workspace_id, role FROM user_roles WHERE user_id = ${sub} LIMIT 1
      `;
      if (!roleRow) {
        reply.status(403).send({ error: 'Could not assign workspace role' });
        return;
      }
    }

    const workspaceId = roleRow.workspaceId ?? roleRow.workspace_id;
    if (!workspaceId) {
      reply.status(403).send({ error: 'No workspace assigned to this account' });
      return;
    }

    req.userId = sub;
    req.userEmail = email;
    req.workspaceId = workspaceId;
    req.userRole = roleRow.role as UserRole;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[auth] database error:', message);
    reply.status(500).send({
      error:
        process.env.NODE_ENV === 'development'
          ? `Database error during sign-in: ${message}`
          : 'Internal server error',
    });
  }
}
