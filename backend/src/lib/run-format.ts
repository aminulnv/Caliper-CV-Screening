export interface SharedUser {
  user_id: string;
  name: string | null;
  email: string;
  avatar_url: string | null;
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

/** Normalize run list/detail rows for the frontend API. */
export function formatRunResponse(row: Record<string, unknown>, userId: string) {
  const sharedUsers = formatSharedUsers(row.sharedUsers ?? row.shared_users);
  const rawIds = row.sharedUserIds ?? row.shared_user_ids;
  const sharedUserIds = Array.isArray(rawIds)
    ? rawIds
    : sharedUsers.map((u) => u.user_id);

  return {
    ...row,
    is_owner: (row.ownerId ?? row.owner_id) === userId,
    owner_avatar_url: (row.ownerAvatarUrl ?? row.owner_avatar_url ?? null) as string | null,
    shared_user_ids: sharedUserIds,
    shared_users: sharedUsers,
    job_profiles: row.jobName
      ? { name: row.jobName as string, dept: (row.jobDept ?? null) as string | null }
      : null,
  };
}
