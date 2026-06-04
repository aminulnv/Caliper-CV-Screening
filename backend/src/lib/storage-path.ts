/** S3 object keys are scoped per workspace: `{workspaceId}/…` */

export function isWorkspaceStoragePath(path: string, workspaceId: string): boolean {
  if (!path?.trim() || !workspaceId?.trim()) return false;
  if (path.includes('..') || path.includes('\\')) return false;
  const prefix = `${workspaceId}/`;
  return path.startsWith(prefix) && path.length > prefix.length;
}
