// One-off backfill: generate cv_embeddings for historical run_candidates.
//
// New runs embed automatically when SEMANTIC_CV_SEARCH_ENABLED=true; this
// script covers candidates screened before the flag was turned on.
//
// Prerequisites:
//   - pgvector enabled and migrate-cv-embeddings.sql applied (npm run migrate)
//   - npm run build (imports compiled modules from ../dist)
//   - backend/.env with DATABASE_URL, S3_BUCKET, AWS credentials/role
//
// Usage (from backend/):
//   node scripts/backfill-cv-embeddings.mjs --dry-run     # count only, no API calls
//   node scripts/backfill-cv-embeddings.mjs               # backfill everything pending
//   node scripts/backfill-cv-embeddings.mjs --limit 50    # cap candidates this run
import 'dotenv/config';
import { sql } from '../dist/services/db.js';
import { storage } from '../dist/services/storage.js';
import { parsePdfBuffer } from '../dist/services/cv-parser.js';
import {
  buildEmbeddingDocument,
  upsertCandidateEmbedding,
} from '../dist/services/cv-embedding.js';
import { getWorkspaceKeys } from '../dist/services/workspace.js';

const dryRun = process.argv.includes('--dry-run');
const limitArgIndex = process.argv.indexOf('--limit');
const limit =
  limitArgIndex !== -1 ? Number.parseInt(process.argv[limitArgIndex + 1], 10) : null;
if (limitArgIndex !== -1 && (!Number.isInteger(limit) || limit <= 0)) {
  console.error('--limit requires a positive integer');
  process.exit(1);
}

const [tableCheck] = await sql`SELECT to_regclass('cv_embeddings') AS table_name`;
if (!tableCheck.tableName) {
  console.error(
    'cv_embeddings table not found. Enable pgvector (backend/scripts/enable-pgvector.sql) and run `npm run migrate` first.',
  );
  await sql.end();
  process.exit(1);
}

const pending = await sql`
  SELECT rc.id, rc.name, rc.summary, rc.cv_storage_path, sr.workspace_id
  FROM run_candidates rc
  JOIN screening_runs sr ON sr.id = rc.run_id
  LEFT JOIN cv_embeddings ce ON ce.candidate_id = rc.id
  WHERE rc.cv_storage_path IS NOT NULL
    AND (ce.candidate_id IS NULL OR ce.status = 'failed')
  ORDER BY rc.created_at ASC
  ${limit ? sql`LIMIT ${limit}` : sql``}
`;

console.log(`Candidates pending embedding: ${pending.length}${limit ? ` (limit ${limit})` : ''}`);

if (dryRun || pending.length === 0) {
  if (dryRun && pending.length > 0) {
    const byWorkspace = new Map();
    for (const row of pending) {
      byWorkspace.set(row.workspaceId, (byWorkspace.get(row.workspaceId) ?? 0) + 1);
    }
    for (const [workspaceId, count] of byWorkspace) {
      console.log(`  workspace ${workspaceId}: ${count}`);
    }
    console.log('Dry run — nothing embedded.');
  }
  await sql.end();
  process.exit(0);
}

const keysByWorkspace = new Map();
async function resolveKeys(workspaceId) {
  if (!keysByWorkspace.has(workspaceId)) {
    try {
      keysByWorkspace.set(workspaceId, await getWorkspaceKeys(workspaceId));
    } catch (err) {
      console.warn(`workspace ${workspaceId}: cannot load keys (${err.message}) — skipping`);
      keysByWorkspace.set(workspaceId, null);
    }
  }
  return keysByWorkspace.get(workspaceId);
}

let processed = 0;
let skippedNoKey = 0;
let downloadOrParseFailed = 0;

for (const candidate of pending) {
  const label = `${candidate.name ?? 'unnamed'} (${candidate.id})`;
  const keys = await resolveKeys(candidate.workspaceId);
  if (!keys?.openai) {
    skippedNoKey += 1;
    continue;
  }

  let parsed;
  try {
    const pdfBuffer = await storage.download(candidate.cvStoragePath);
    parsed = await parsePdfBuffer(pdfBuffer);
  } catch (err) {
    downloadOrParseFailed += 1;
    console.error(`FAIL  ${label}: ${err.message}`);
    continue;
  }

  const document = buildEmbeddingDocument(candidate.name ?? '', parsed.text, candidate.summary);
  // Hash-skip, dimension checks, and failure marking happen inside the upsert.
  await upsertCandidateEmbedding({
    candidateId: candidate.id,
    workspaceId: candidate.workspaceId,
    document,
    keys,
  });
  processed += 1;
  if (processed % 25 === 0) {
    console.log(`...${processed}/${pending.length}`);
  }
}

const statusRows = await sql`SELECT status, count(*)::int AS count FROM cv_embeddings GROUP BY status`;

console.log('\nDone.');
console.log(`  processed:              ${processed}`);
console.log(`  skipped (no OpenAI key): ${skippedNoKey}`);
console.log(`  download/parse failed:  ${downloadOrParseFailed}`);
console.log('cv_embeddings totals:');
for (const row of statusRows) {
  console.log(`  ${row.status}: ${row.count}`);
}

await sql.end();
