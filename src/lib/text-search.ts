/**
 * Case-insensitive substring match against any of the provided string fields.
 * Empty query matches everything.
 */
export function matchesTextQuery(
  query: string,
  values: (string | null | undefined)[],
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return values.some((v) => v != null && String(v).toLowerCase().includes(q));
}
