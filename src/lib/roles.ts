import type { UserRole } from '@/services/api';

export const ROLE_LABELS: Record<UserRole, string> = {
  viewer: 'Viewer',
  recruiter: 'Editor',
  admin: 'Admin',
};

export function labelForRole(role: UserRole): string {
  return ROLE_LABELS[role] ?? role;
}

export function canEditWorkspace(role: UserRole | null | undefined): boolean {
  return role === 'recruiter' || role === 'admin';
}

export function isWorkspaceAdmin(role: UserRole | null | undefined): boolean {
  return role === 'admin';
}
