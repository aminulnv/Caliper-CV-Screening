import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import { openaiEmbeddingUsage } from '../lib/token-usage.js';
import type { TokenUsage } from './ai-usage.js';
import { sql } from './db.js';
import type { WorkspaceKeys } from './model-router.js';

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;
const MAX_DOCUMENT_CHARS = 15_000;
const MIN_DOCUMENT_CHARS = 50;

export function buildEmbeddingDocument(
  name: string,
  cvText: string,
  summary?: string | null,
): string {
  const parts: string[] = [];
  const trimmedName = name?.trim();
  if (trimmedName) parts.push(`Candidate: ${trimmedName}`);
  const trimmedSummary = summary?.trim();
  if (trimmedSummary) parts.push(`Summary: ${trimmedSummary}`);
  const trimmedCv = cvText.trim();
  if (trimmedCv) parts.push(trimmedCv);
  return parts.join('\n\n').slice(0, MAX_DOCUMENT_CHARS);
}

function hashDocument(document: string): string {
  return createHash('sha256').update(document).digest('hex');
}

export interface EmbeddingResponse {
  embeddings: number[][];
  usage: TokenUsage;
}

export async function embedTexts(texts: string[], openaiKey: string): Promise<EmbeddingResponse> {
  const client = new OpenAI({ apiKey: openaiKey });
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return {
    embeddings: response.data
      .sort((a, b) => a.index - b.index)
      .map((row) => row.embedding),
    usage: openaiEmbeddingUsage(EMBEDDING_MODEL, response),
  };
}

function vectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

export async function upsertCandidateEmbedding(args: {
  candidateId: string;
  workspaceId: string;
  document: string;
  keys: WorkspaceKeys;
  userId?: string;
  runId?: string;
  jobId?: string;
}): Promise<void> {
  const { candidateId, workspaceId, document, keys, userId, runId, jobId } = args;
  if (document.length < MIN_DOCUMENT_CHARS) return;
  if (!keys.openai) {
    console.warn(`[cv-embedding] skip ${candidateId}: no OpenAI key configured`);
    return;
  }

  const contentHash = hashDocument(document);

  const [existing] = await sql`
    SELECT content_hash, status
    FROM cv_embeddings
    WHERE candidate_id = ${candidateId}
  `;
  if (existing && (existing.contentHash ?? existing.content_hash) === contentHash) {
    return;
  }

  try {
    const { embeddings, usage } = await embedTexts([document], keys.openai);
    const embedding = embeddings[0];
    if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Unexpected embedding dimensions: ${embedding?.length ?? 0}`);
    }

    if (userId) {
      const { logAiUsage } = await import('./ai-usage.js');
      await logAiUsage({
        workspaceId,
        userId,
        feature: 'embedding',
        usage,
        runId: runId ?? null,
        jobId: jobId ?? null,
      });
    }

    const vectorStr = vectorLiteral(embedding);
    await sql`
      INSERT INTO cv_embeddings
        (candidate_id, workspace_id, embedding, content_hash, model, status)
      VALUES (
        ${candidateId},
        ${workspaceId},
        ${vectorStr}::vector,
        ${contentHash},
        ${EMBEDDING_MODEL},
        'ready'
      )
      ON CONFLICT (candidate_id) DO UPDATE SET
        workspace_id = EXCLUDED.workspace_id,
        embedding = EXCLUDED.embedding,
        content_hash = EXCLUDED.content_hash,
        model = EXCLUDED.model,
        status = 'ready'
    `;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cv-embedding] failed for ${candidateId}:`, message);
    await sql`
      UPDATE cv_embeddings
      SET status = 'failed'
      WHERE candidate_id = ${candidateId}
    `.catch(() => {});
  }
}
