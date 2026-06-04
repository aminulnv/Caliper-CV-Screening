import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { storage } from '../services/storage.js';
import { isWorkspaceStoragePath } from '../lib/storage-path.js';
import { parsePdfBuffer } from '../services/cv-parser.js';
import { randomUUID } from 'crypto';

const ALLOWED_MIME_TYPES = new Set(['application/pdf']);

export async function cvRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // POST /cv/upload — upload a PDF, store it, return the storage path
  app.post(
    '/cv/upload',
    { preHandler: requireRole('recruiter') },
    async (req, reply) => {
      const file = await req.file();
      if (!file) return reply.status(400).send({ error: 'No file provided' });

      // Validate file type (OWASP A03 / strict input validation)
      const mime = file.mimetype;
      if (!ALLOWED_MIME_TYPES.has(mime)) {
        return reply.status(400).send({ error: 'Only PDF files are accepted' });
      }

      const buffer = await file.toBuffer();
      const path = `${req.workspaceId}/${randomUUID()}.pdf`;

      await storage.upload(path, buffer, 'application/pdf');

      return { path, filename: file.filename };
    }
  );

  // POST /cv/parse — extract text from an already-uploaded PDF
  app.post<{ Body: { path: string } }>(
    '/cv/parse',
    { preHandler: requireRole('recruiter') },
    async (req, reply) => {
      const { path } = req.body;
      if (!path) return reply.status(400).send({ error: 'path is required' });

      // Ensure path belongs to this workspace
      if (!isWorkspaceStoragePath(path, req.workspaceId)) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const buffer = await storage.download(path);
      const parsed = await parsePdfBuffer(buffer);

      // Return parse metadata only — NOT the raw CV text (never expose PII to frontend)
      return {
        page_count: parsed.pageCount,
        char_count: parsed.text.length,
        warning: parsed.warning,
      };
    }
  );
}
