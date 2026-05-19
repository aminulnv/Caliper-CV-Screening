import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UserRole } from '../types/index.js';

const ROLE_RANK: Record<UserRole, number> = { viewer: 0, recruiter: 1, admin: 2 };

export function requireRole(minimum: UserRole) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (ROLE_RANK[req.userRole] < ROLE_RANK[minimum]) {
      reply.status(403).send({ error: 'Forbidden' });
    }
  };
}
