import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { sql } from '../services/db.js';
import { getWorkspaceKeys } from '../services/workspace.js';
import { embedTexts, EMBEDDING_MODEL } from '../services/cv-embedding.js';
import { semanticCvSearchEnabled } from '../config/features.js';

const MIN_QUERY_LENGTH = 3;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MIN_SIMILARITY = 0.25;

export async function cvSearchRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get<{ Querystring: { q?: string; limit?: string } }>(
    '/cv-search',
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
    },
    async (req, reply) => {
      if (!semanticCvSearchEnabled) {
        return reply.status(503).send({
          error: 'Talent Search is not enabled yet. Requires pgvector on the database.',
        });
      }

      const query = req.query.q?.trim() ?? '';
      if (query.length < MIN_QUERY_LENGTH) {
        return reply.status(400).send({
          error: `Query must be at least ${MIN_QUERY_LENGTH} characters`,
        });
      }

      const limitRaw = Number(req.query.limit ?? DEFAULT_LIMIT);
      const limit = Number.isFinite(limitRaw)
        ? Math.min(Math.max(1, Math.floor(limitRaw)), MAX_LIMIT)
        : DEFAULT_LIMIT;

      const keys = await getWorkspaceKeys(req.workspaceId);
      if (!keys.openai) {
        return reply.status(503).send({
          error: 'OpenAI API key required for semantic CV search',
        });
      }

      let queryEmbedding: number[];
      try {
        [queryEmbedding] = await embedTexts([query], keys.openai);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(502).send({ error: `Embedding failed: ${message}` });
      }

      const vectorStr = `[${queryEmbedding.join(',')}]`;

      const rows = await sql`
        SELECT rc.id, rc.name, rc.title, rc.score, rc.status, rc.run_id,
               jp.id AS job_id, jp.name AS job_name,
               1 - (cve.embedding <=> ${vectorStr}::vector) AS similarity
        FROM cv_embeddings cve
        JOIN run_candidates rc ON rc.id = cve.candidate_id
        JOIN screening_runs sr ON sr.id = rc.run_id
        LEFT JOIN job_profiles jp ON sr.job_id = jp.id
        WHERE cve.workspace_id = ${req.workspaceId}
          AND cve.status = 'ready'
          AND (
            sr.owner_id = ${req.userId}
            OR EXISTS (
              SELECT 1 FROM run_shares rs
              WHERE rs.run_id = sr.id AND rs.user_id = ${req.userId}
            )
          )
        ORDER BY cve.embedding <=> ${vectorStr}::vector
        LIMIT ${limit}
      `;

      const results = rows
        .map((row) => ({
          candidate_id: row.id as string,
          name: (row.name as string | null) ?? null,
          title: (row.title as string | null) ?? null,
          score: row.score != null ? Number(row.score) : null,
          status: (row.status as string | null) ?? null,
          run_id: (row.runId ?? row.run_id) as string,
          job_id: (row.jobId ?? row.job_id) as string | null,
          job_name: (row.jobName ?? row.job_name) as string | null,
          similarity: Number(row.similarity),
        }))
        .filter((row) => row.similarity >= MIN_SIMILARITY);

      return {
        query,
        model: EMBEDDING_MODEL,
        results,
      };
    },
  );
}
