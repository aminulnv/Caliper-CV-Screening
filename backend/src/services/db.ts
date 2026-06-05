import 'dotenv/config';
import postgres from 'postgres';
import { resolveDatabaseUrl } from '../config/database-url.js';

const databaseUrl = resolveDatabaseUrl();

/** RDS rejects non-TLS connections even from local dev (pg_hba "no encryption"). */
function resolveSsl():
  | false
  | { rejectUnauthorized: boolean } {
  if (process.env.DATABASE_SSL === 'false') return false;
  const needsTls =
    process.env.DATABASE_SSL === 'true' ||
    databaseUrl.includes('rds.amazonaws.com');
  if (!needsTls && process.env.NODE_ENV !== 'production') return false;
  return { rejectUnauthorized: process.env.NODE_ENV === 'production' };
}

export const sql = postgres(databaseUrl, {
  ssl: resolveSsl(),
  max: 20,
  idle_timeout: 30,
  connect_timeout: 10,
  transform: postgres.camel,
});
