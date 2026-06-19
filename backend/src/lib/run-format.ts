export interface SharedUser {
  user_id: string;
  name: string | null;
  email: string;
  avatar_url: string | null;
}

function normalizeStringIdArray(raw: unknown, fallback: string[] = []): string[] {
  if (Array.isArray(raw)) {
    return raw.map((id) => String(id)).filter((id) => id && id !== 'undefined');
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (t.startsWith('{') && t.endsWith('}')) {
      return t
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^"|"$/g, ''))
        .filter(Boolean);
    }
    if (t) return [t];
  }
  return fallback;
}

function formatSharedUsers(raw: unknown): SharedUser[] {
  if (!raw) return [];
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list.map((u) => {
    const row = u as Record<string, unknown>;
    return {
      user_id: String(row.userId ?? row.user_id ?? ''),
      name: (row.name ?? null) as string | null,
      email: String(row.email ?? ''),
      avatar_url: (row.avatarUrl ?? row.avatar_url ?? null) as string | null,
    };
  }).filter((u) => u.user_id);
}

/**
 * Normalize run list/detail rows for the frontend API.
 *
 * postgres.js applies `transform: postgres.camel`, so DB columns arrive camelCased
 * (jobId, cvCount, …). The frontend RunListItem/RunDetail contract is snake_case,
 * so we explicitly emit snake_case keys here — otherwise `run.job_id` is undefined
 * on the client and downstream features (pipeline stages, re-run) silently break.
 */
export function formatRunResponse(row: Record<string, unknown>, userId: string) {
  const sharedUsers = formatSharedUsers(row.sharedUsers ?? row.shared_users);
  const rawIds = row.sharedUserIds ?? row.shared_user_ids;
  const sharedUserIds = normalizeStringIdArray(
    rawIds,
    sharedUsers.map((u) => u.user_id),
  );

  const pick = <T = unknown>(camel: string, snake: string): T =>
    (row[camel] ?? row[snake] ?? null) as T;

  const ownerId = String(row.ownerId ?? row.owner_id ?? '');
  const isOwner = ownerId === userId;

  return {
    id: row.id,
    job_id: pick<string | null>('jobId', 'job_id'),
    model_used: pick<string | null>('modelUsed', 'model_used'),
    status: row.status,
    owner_id: pick<string | null>('ownerId', 'owner_id'),
    cv_count: pick<number | null>('cvCount', 'cv_count'),
    score_range: pick<number[] | null>('scoreRange', 'score_range'),
    error_message: pick<string | null>('errorMessage', 'error_message'),
    run_note: pick<string | null>('runNote', 'run_note'),
    started_at: pick<string | null>('startedAt', 'started_at'),
    completed_at: pick<string | null>('completedAt', 'completed_at'),
    created_at: pick<string | null>('createdAt', 'created_at'),
    is_owner: isOwner,
    access: isOwner ? 'owner' : 'shared',
    owner_name: pick<string | null>('ownerName', 'owner_name'),
    owner_email: pick<string | null>('ownerEmail', 'owner_email'),
    owner_avatar_url: pick<string | null>('ownerAvatarUrl', 'owner_avatar_url'),
    shared_user_ids: sharedUserIds,
    shared_users: sharedUsers,
    job_profiles: row.jobName
      ? { name: row.jobName as string, dept: (row.jobDept ?? null) as string | null }
      : null,
  };
}