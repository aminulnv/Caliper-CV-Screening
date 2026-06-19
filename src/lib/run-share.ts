/** Google OAuth subs are large integers — always treat as strings in share payloads. */
export function memberUserId(member: { user_id?: string; userId?: string } | null | undefined): string {
  const id = member?.user_id ?? member?.userId;
  return id != null && id !== '' ? String(id) : '';
}

/** Normalize shared_user_ids from API (array, Postgres array string, or shared_users fallback). */
export function parseSharedUserIds(
  raw: unknown,
  sharedUsers?: Array<{ user_id?: string; userId?: string }> | null,
): string[] {
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
  if (sharedUsers?.length) {
    return sharedUsers
      .map((u) => String(u.user_id ?? u.userId ?? ''))
      .filter((id) => id && id !== 'undefined');
  }
  return [];
}

export function isRunSharedWithViewer(
  run: { is_owner?: boolean; isOwner?: boolean; access?: string },
): boolean {
  if (run.access === 'shared') return true;
  if (run.is_owner === false || run.isOwner === false) return true;
  return false;
}
