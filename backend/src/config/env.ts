const REQUIRED = [
  'DATABASE_URL',
  'ENCRYPTION_MASTER_KEY',
  'GOOGLE_CLIENT_ID',
  'S3_BUCKET',
  'DEFAULT_WORKSPACE_ID',
] as const;

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function validateEnv(): void {
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
