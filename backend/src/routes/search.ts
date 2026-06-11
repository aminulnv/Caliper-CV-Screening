import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { sql } from '../services/db.js';

const RESULT_LIMIT = 8;

export async function searchRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get<{ Querystring: { q?: string } }>('/search', async (req) => {
    const q = req.query.q?.trim() ?? '';
    if (q.length < 2) {
      return { jobs: [], runs: [], candidates: [] };
    }

    const pattern = `%${q.replace(/[%_\\]/g, '\\$&')}%`;

    const jobs = await sql`
      SELECT id, name, dept, status
      FROM job_profiles
      WHERE workspace_id = ${req.workspaceId}
        AND (name ILIKE ${pattern} OR dept ILIKE ${pattern})
      ORDER BY updated_at DESC
      LIMIT ${RESULT_LIMIT}
    `;

    const runs = await sql`
      SELECT sr.id, sr.status, sr.run_note, sr.created_at,
             jp.name AS job_name, jp.dept AS job_dept
      FROM screening_runs sr
      LEFT JOIN job_profiles jp ON sr.job_id = jp.id
      WHERE sr.workspace_id = ${req.workspaceId}
        AND (
          sr.owner_id = ${req.userId}
          OR EXISTS (
            SELECT 1 FROM run_shares rs2
            WHERE rs2.run_id = sr.id AND rs2.user_id = ${req.userId}
          )
        )
        AND (
          sr.id ILIKE ${pattern}
          OR sr.run_note ILIKE ${pattern}
          OR jp.name ILIKE ${pattern}
          OR jp.dept ILIKE ${pattern}
        )
      ORDER BY sr.created_at DESC
      LIMIT ${RESULT_LIMIT}
    `;

    const candidates = await sql`
      SELECT rc.id, rc.name, rc.title, rc.score, rc.status, rc.run_id,
             jp.name AS job_name
      FROM run_candidates rc
      JOIN screening_runs sr ON rc.run_id = sr.id
      LEFT JOIN job_profiles jp ON sr.job_id = jp.id
      WHERE sr.workspace_id = ${req.workspaceId}
        AND (
          sr.owner_id = ${req.userId}
          OR EXISTS (
            SELECT 1 FROM run_shares rs2
            WHERE rs2.run_id = sr.id AND rs2.user_id = ${req.userId}
          )
        )
        AND (
          rc.name ILIKE ${pattern}
          OR rc.title ILIKE ${pattern}
          OR rc.summary ILIKE ${pattern}
        )
      ORDER BY rc.score DESC NULLS LAST
      LIMIT ${RESULT_LIMIT}
    `;

    return {
      jobs: jobs.map((j) => ({
        id: j.id,
        name: j.name,
        dept: j.dept ?? null,
        status: j.status,
      })),
      runs: runs.map((r) => ({
        id: r.id,
        status: r.status,
        run_note: r.runNote ?? r.run_note ?? null,
        job_name: r.jobName ?? r.job_name ?? null,
        job_dept: r.jobDept ?? r.job_dept ?? null,
        created_at: r.createdAt ?? r.created_at,
      })),
      candidates: candidates.map((c) => ({
        id: c.id,
        name: c.name ?? null,
        title: c.title ?? null,
        score: c.score ?? null,
        status: c.status ?? null,
        run_id: c.runId ?? c.run_id,
        job_name: c.jobName ?? c.job_name ?? null,
      })),
    };
  });
}
