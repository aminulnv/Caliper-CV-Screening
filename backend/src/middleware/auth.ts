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

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

const DEFAULT_USER_ROLE: UserRole = 'recruiter';

const ALLOWED_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS ?? 'nextventures.io,wearenext.io,fn.com')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

function isAllowedEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return ALLOWED_DOMAINS.includes(domain ?? '');
}

async function migrateUserSub(oldSub: string, newSub: string, email: string, name: string): Promise<void> {
  if (oldSub === newSub) return;

  const tempEmail = `${email}.__sub_migrate__`;

  await sql.begin(async (tx) => {
    // New `sub` must exist in `users` before FKs can point at it; email is unique so use a temp address first.
    await tx`
      INSERT INTO users (sub, email, name)
      VALUES (${newSub}, ${tempEmail}, ${name})
      ON CONFLICT (sub) DO UPDATE SET name = EXCLUDED.name, last_seen_at = NOW()
    `;
    await tx`UPDATE user_roles SET user_id = ${newSub} WHERE user_id = ${oldSub}`;
    await tx`UPDATE job_profiles SET created_by = ${newSub} WHERE created_by = ${oldSub}`;
    await tx`UPDATE screening_runs SET owner_id = ${newSub} WHERE owner_id = ${oldSub}`;
    await tx`UPDATE candidate_evaluations SET overridden_by = ${newSub} WHERE overridden_by = ${oldSub}`;
    await tx`UPDATE audit_log SET user_id = ${newSub} WHERE user_id = ${oldSub}`;
    await tx`DELETE FROM users WHERE sub = ${oldSub}`;
    await tx`
      UPDATE users SET email = ${email}, name = ${name}, last_seen_at = NOW() WHERE sub = ${newSub}
    `;
  });
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
    const result = await jwtVerify(token, JWKS, {
      issuer: GOOGLE_ISSUERS,
      audience: GOOGLE_CLIENT_ID,
    });
    payload = result.payload as Record<string, unknown>;
  } catch (err) {
    console.log('[auth] JWT verify failed:', err);
    reply.status(401).send({ error: 'Unauthorized' });
    return;
  }

  const sub = payload.sub as string;
  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : undefined;
  const emailVerified = payload.email_verified;

  if (!sub || !email || emailVerified !== true) {
    reply.status(401).send({
      error: 'Sign-in token is missing a verified email. Sign out and sign in again with Google.',
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

  const name =
    (typeof payload.name === 'string' && payload.name) ||
    (typeof payload.given_name === 'string' && payload.given_name) ||
    email;

  try {
    const [existingByEmail] = await sql`SELECT sub FROM users WHERE email = ${email} LIMIT 1`;

    if (existingByEmail && existingByEmail.sub !== sub) {
      await migrateUserSub(existingByEmail.sub as string, sub, email, name);
    } else {
      await sql`
        INSERT INTO users (sub, email, name)
        VALUES (${sub}, ${email}, ${name})
        ON CONFLICT (sub) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, last_seen_at = NOW()
      `;
    }

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
