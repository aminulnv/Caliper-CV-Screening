import 'dotenv/config';
import './config/env.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';

import { runsRoutes } from './routes/runs.js';
import { candidatesRoutes } from './routes/candidates.js';
import { cvRoutes } from './routes/cv.js';
import { jobsRoutes } from './routes/jobs.js';
import { recruiteeRoutes } from './routes/recruitee.js';
import { settingsRoutes } from './routes/settings.js';
import { relatedProfilesRoutes } from './routes/related-profiles.js';
import { runRetentionCleanup } from './services/retention.js';
import { runScheduledRecruiteeJobSync } from './services/recruitee-sync.js';

const PORT = Number(process.env.PORT ?? 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

const server = Fastify({ logger: true });

await server.register(cors, {
  origin: [CORS_ORIGIN, 'http://localhost:5174', 'http://localhost:5173'],
  credentials: true,
});
await server.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max
await server.register(rateLimit, { max: 100, timeWindow: '1 minute' });

// API versioning prefix
const API_PREFIX = '/api/v1';

await server.register(runsRoutes, { prefix: API_PREFIX });
await server.register(candidatesRoutes, { prefix: API_PREFIX });
await server.register(cvRoutes, { prefix: API_PREFIX });
await server.register(jobsRoutes, { prefix: API_PREFIX });
await server.register(recruiteeRoutes, { prefix: API_PREFIX });
await server.register(settingsRoutes, { prefix: API_PREFIX });
await server.register(relatedProfilesRoutes, { prefix: API_PREFIX });

// Health check — no auth required
server.get('/health', async () => ({ status: 'ok' }));

// Centralized error handler — never expose stack traces in production (OWASP A04)
server.setErrorHandler((error: Error & { statusCode?: number }, _req, reply) => {
  server.log.error(error);
  const status = error.statusCode ?? 500;
  const isDev = process.env.NODE_ENV !== 'production';
  reply.status(status).send({
    error: status >= 500 ? 'Internal server error' : error.message,
    ...(status >= 500 && isDev && error.message ? { message: error.message } : {}),
  });
});

const RETENTION_ENABLED = process.env.RETENTION_ENABLED !== 'false';
const RETENTION_INTERVAL_MS = Number(process.env.RETENTION_INTERVAL_MS ?? 24 * 60 * 60 * 1000);
const RECRUITEE_SYNC_ENABLED = process.env.RECRUITEE_SYNC_ENABLED !== 'false';
const RECRUITEE_SYNC_INTERVAL_MS = Number(
  process.env.RECRUITEE_SYNC_INTERVAL_MS ?? 15 * 60 * 1000,
);

function scheduleRetentionCleanup(): void {
  const run = () => {
    runRetentionCleanup()
      .then((stats) => server.log.info({ stats }, 'Retention cleanup finished'))
      .catch((err) => server.log.error(err, 'Retention cleanup failed'));
  };

  // Stagger first run so the server is up; then daily (configurable).
  setTimeout(run, 60_000);
  setInterval(run, RETENTION_INTERVAL_MS);
}

function scheduleRecruiteeJobSync(): void {
  const run = () => {
    runScheduledRecruiteeJobSync()
      .then((stats) => server.log.info({ stats }, 'Recruitee job sync finished'))
      .catch((err) => server.log.error(err, 'Recruitee job sync failed'));
  };

  setTimeout(run, 30_000);
  setInterval(run, RECRUITEE_SYNC_INTERVAL_MS);
}

try {
  await server.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Caliper backend running on port ${PORT}`);
  if (RETENTION_ENABLED) {
    scheduleRetentionCleanup();
    console.log(`Retention cleanup scheduled every ${RETENTION_INTERVAL_MS}ms`);
  }
  if (RECRUITEE_SYNC_ENABLED) {
    scheduleRecruiteeJobSync();
    console.log(`Recruitee job sync scheduled every ${RECRUITEE_SYNC_INTERVAL_MS}ms`);
  }
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
