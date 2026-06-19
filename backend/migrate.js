import postgres from 'postgres';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

config();

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveDatabaseUrl() {
  const direct = process.env.DATABASE_URL?.trim();
  if (direct) return direct;

  const host = process.env.DB_HOST?.trim();
  const port = process.env.DB_PORT?.trim() || '5432';
  const user = process.env.DB_USERNAME?.trim();
  const password = process.env.DB_PASSWORD ?? '';
  const database = process.env.DB_NAME?.trim();

  if (!host || !user || !database || !password.trim()) {
    console.error(
      'Missing database config. Set DATABASE_URL or DB_HOST, DB_USERNAME, DB_PASSWORD, and DB_NAME in backend/.env.',
    );
    process.exit(1);
  }

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

const databaseUrl = resolveDatabaseUrl();

function resolveSsl() {
  if (process.env.DATABASE_SSL === 'false') return false;
  const needsTls =
    process.env.DATABASE_SSL === 'true' ||
    databaseUrl.includes('rds.amazonaws.com');
  if (!needsTls && process.env.NODE_ENV !== 'production') return false;
  if (process.env.DATABASE_TLS_INSECURE === 'true') return { rejectUnauthorized: false };
  return { rejectUnauthorized: process.env.NODE_ENV === 'production' };
}

const sql = postgres(databaseUrl, {
  ssl: resolveSsl(),
  max: 1,
});

const migrations = [
  './migrate-rds.sql',
  './migrate-retention.sql',
  './migrate-job-screening-model.sql',
  './migrate-job-applicants-count.sql',
  './migrate-job-criteria-archived.sql',
  './migrate-score-breakdown.sql',
  './migrate-checklist-pct.sql',
  './migrate-related-profiles.sql',
  './migrate-related-profiles-null-stars.sql',
  './migrate-access-management.sql',
  './migrate-run-note.sql',
  './migrate-notifications.sql',
  './migrate-drop-penalty-must.sql',
  './migrate-evaluation-agree.sql',
  './migrate-candidate-email.sql',
  './migrate-eval-ai-met.sql',
  './migrate-cv-embeddings.sql',
  './migrate-ai-budget.sql',
  './migrate-candidate-disposition.sql',
  './migrate-cv-quality.sql',
  './migrate-run-share-user-id.sql',
];

let failed = false;

async function isPgvectorInstalled() {
  const [row] = await sql`
    SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS installed
  `;
  return Boolean(row?.installed);
}

for (const file of migrations) {
  const path = join(__dirname, file);
  const content = readFileSync(path, 'utf8');
  console.log(`Running ${file}...`);

  if (file === './migrate-cv-embeddings.sql') {
    const installed = await isPgvectorInstalled();
    if (!installed) {
      console.warn(
        '⚠ Skipping migrate-cv-embeddings.sql: pgvector extension is not installed.',
      );
      console.warn(
        '  Talent Search requires: CREATE EXTENSION IF NOT EXISTS vector;',
      );
      console.warn(
        '  Run as superuser: psql "$DATABASE_URL" -f backend/scripts/enable-pgvector.sql',
      );
      console.warn('  Then re-run: npm run migrate');
      continue;
    }
  }

  try {
    await sql.unsafe(content);
    console.log(`✓ ${file} done`);
  } catch (err) {
    failed = true;
    console.error(`✗ ${file} failed:`, err.message);
  }
}

await sql.end();

if (failed) {
  console.error('Migration failed. Fix errors above and re-run: npm run migrate');
  process.exit(1);
}

console.log('All migrations complete.');
