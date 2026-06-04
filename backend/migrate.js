import postgres from 'postgres';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

config();

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL. Set it in backend/.env before running migrations.');
  process.exit(1);
}

function resolveSsl() {
  if (process.env.DATABASE_SSL === 'false') return false;
  const needsTls =
    process.env.DATABASE_SSL === 'true' ||
    process.env.DATABASE_URL.includes('rds.amazonaws.com');
  if (!needsTls && process.env.NODE_ENV !== 'production') return false;
  return { rejectUnauthorized: process.env.NODE_ENV === 'production' };
}

const sql = postgres(process.env.DATABASE_URL, {
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
];

let failed = false;

for (const file of migrations) {
  const path = join(__dirname, file);
  const content = readFileSync(path, 'utf8');
  console.log(`Running ${file}...`);
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
