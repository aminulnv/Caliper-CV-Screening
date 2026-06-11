import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notifications.js';

export async function notificationsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/notifications', async (req) => {
    const rows = await listNotifications(req.userId);
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      link_path: row.link_path,
      read: row.read_at != null,
      created_at: row.created_at,
    }));
  });

  app.patch<{ Params: { id: string } }>('/notifications/:id/read', async (req, reply) => {
    const ok = await markNotificationRead(req.userId, req.params.id);
    if (!ok) return reply.status(404).send({ error: 'Notification not found' });
    return { success: true };
  });

  app.post('/notifications/read-all', async (req) => {
    const count = await markAllNotificationsRead(req.userId);
    return { success: true, count };
  });
}
