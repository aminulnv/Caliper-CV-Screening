import { sql } from './db.js';

export type NotificationRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  link_path: string | null;
  read_at: string | null;
  created_at: string;
};

export async function createNotification(input: {
  workspaceId: string;
  userId: string;
  type: string;
  title: string;
  message?: string | null;
  linkPath?: string | null;
}): Promise<string | null> {
  const [row] = await sql`
    INSERT INTO notifications (workspace_id, user_id, type, title, message, link_path)
    VALUES (
      ${input.workspaceId},
      ${input.userId},
      ${input.type},
      ${input.title},
      ${input.message ?? null},
      ${input.linkPath ?? null}
    )
    RETURNING id
  `;
  return (row?.id as string) ?? null;
}

export async function listNotifications(userId: string, limit = 40): Promise<NotificationRow[]> {
  const rows = await sql`
    SELECT id, workspace_id, user_id, type, title, message, link_path, read_at, created_at
    FROM notifications
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => row as unknown as NotificationRow);
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<boolean> {
  const rows = await sql`
    UPDATE notifications
    SET read_at = COALESCE(read_at, NOW())
    WHERE id = ${notificationId} AND user_id = ${userId}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const rows = await sql`
    UPDATE notifications
    SET read_at = NOW()
    WHERE user_id = ${userId} AND read_at IS NULL
    RETURNING id
  `;
  return rows.length;
}

export async function getUserEmail(userId: string): Promise<string | null> {
  const [row] = await sql`SELECT email FROM users WHERE sub = ${userId} LIMIT 1`;
  return (row?.email as string) ?? null;
}
