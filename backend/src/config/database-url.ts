export function resolveDatabaseUrl(): string {
  const direct = process.env.DATABASE_URL?.trim();
  if (direct) return direct;

  const host = process.env.DB_HOST?.trim();
  const port = process.env.DB_PORT?.trim() || '5432';
  const user = process.env.DB_USERNAME?.trim();
  const password = process.env.DB_PASSWORD ?? '';
  const database = process.env.DB_NAME?.trim();

  if (!host || !user || !database) {
    throw new Error(
      'Database config required: set DATABASE_URL or DB_HOST, DB_USERNAME, DB_PASSWORD, and DB_NAME',
    );
  }

  if (!password.trim()) {
    throw new Error('DB_PASSWORD is required when using DB_HOST/DB_USERNAME/DB_NAME');
  }

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}
