import postgres from 'postgres';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const sql = postgres(process.env.DATABASE_URL, {
  ssl: { rejectUnauthorized: false },
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
];

for (const file of migrations) {
  const path = join(__dirname, file);
  const content = readFileSync(path, 'utf8');
  console.log(`Running ${file}...`);
  try {
    await sql.unsafe(content);
    console.log(`✓ ${file} done`);
  } catch (err) {
    console.error(`✗ ${file} failed:`, err.message);
  }
}

await sql.end();
console.log('Migrations complete.');
