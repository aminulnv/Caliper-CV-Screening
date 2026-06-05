import { resolveDatabaseUrl } from './database-url.js';

const REQUIRED = [
  'ENCRYPTION_MASTER_KEY',
  'GOOGLE_CLIENT_ID',
  'S3_BUCKET',
  'DEFAULT_WORKSPACE_ID',
] as const;

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function hasDatabaseConfig(): boolean {
  if (process.env.DATABASE_URL?.trim()) return true;
  return Boolean(
    process.env.DB_HOST?.trim() &&
      process.env.DB_USERNAME?.trim() &&
      process.env.DB_PASSWORD?.trim() &&
      process.env.DB_NAME?.trim(),
  );
}

export function validateEnv(): void {
  if (!hasDatabaseConfig()) {
    console.error(
      'Missing database config: set DATABASE_URL or DB_HOST, DB_USERNAME, DB_PASSWORD, and DB_NAME',
    );
    process.exit(1);
  }

  try {
    resolveDatabaseUrl();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const missing = REQUIRED.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  const masterKey = process.env.ENCRYPTION_MASTER_KEY!.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(masterKey)) {
    console.error(
      'ENCRYPTION_MASTER_KEY must be 64 hex characters (32 bytes). Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
    process.exit(1);
  }

  if (isProduction()) {
    const prodRequired = ['CORS_ORIGIN'] as const;
    const prodMissing = prodRequired.filter((key) => !process.env[key]?.trim());
    if (prodMissing.length > 0) {
      console.error(`Missing required production environment variables: ${prodMissing.join(', ')}`);
      process.exit(1);
    }
  }
}

validateEnv();
