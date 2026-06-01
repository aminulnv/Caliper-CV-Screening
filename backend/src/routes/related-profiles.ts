import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { writeAuditLog } from '../middleware/audit.js';
import { sql } from '../services/db.js';
import { discoverSimilarProfiles, NeedsCountryError } from '../services/linkedin-discovery.js';
import { scoreJdAlignment } from '../services/jd-alignment.js';
import { getWorkspaceKeys, getWorkspaceSettings } from '../services/workspace.js';
import { pickRunnableModel } from '../services/screening-model.js';

/** postgres.js returns camelCase; frontend expects snake_case. */
function formatRelatedProfile(row: Record<string, unknown>) {
  return {
    id: row.id,
    job_id: row.jobId ?? row.job_id,
    name: row.name,
    title: row.title ?? null,
    company: row.company ?? null,
    location: row.location ?? null,
    linkedin_url: (row.linkedinUrl ?? row.linkedin_url ?? null) as string | null,
    headline: row.headline ?? null,
    profile_summary: (row.profileSummary ?? row.profile_summary ?? null) as string | null,
    alignment_stars: (row.alignmentStars ?? row.alignment_stars ?? null) as number | null,
    alignment_rationale: (row.alignmentRationale ?? row.alignment_rationale ?? null) as string | null,
    source: row.source,
    discovered_at: row.discoveredAt ?? row.discovered_at,
    created_at: row.createdAt ?? row.created_at,
  };
}

function formatDiscovery(row: Record<string, unknown>) {
  return {
    id: row.id,
    job_id: row.jobId ?? row.job_id,
    status: row.status,
    profiles_found: row.profilesFound ?? row.profiles_found,
    error_message: row.errorMessage ?? row.error_message ?? null,
    started_at: row.startedAt ?? row.started_at ?? null,
    completed_at: row.completedAt ?? row.completed_at ?? null,
    created_at: row.createdAt ?? row.created_at,
  };
}

export async function relatedProfilesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get<{ Params: { id: string } }>('/jobs/:id/related-profiles', async (req, reply) => {
    const [job] = await sql`
      SELECT id FROM job_profiles
      WHERE id = ${req.params.id} AND workspace_id = ${req.workspaceId}
    `;
    if (!job) return reply.status(404).send({ error: 'Job not found' });

    const profiles = await sql`
      SELECT id, job_id, name, title, company, location, linkedin_url, headline,
             profile_summary, alignment_stars, alignment_rationale, source,
             discovered_at, created_at
      FROM related_profiles
      WHERE job_id = ${req.params.id} AND workspace_id = ${req.workspaceId}
      ORDER BY alignment_stars DESC NULLS LAST, discovered_at DESC
    `;
    return profiles.map((row) => formatRelatedProfile(row as Record<string, unknown>));
  });

  app.get<{ Params: { id: string } }>('/jobs/:id/related-profiles/discoveries', async (req, reply) => {
    const [job] = await sql`
      SELECT id FROM job_profiles
      WHERE id = ${req.params.id} AND workspace_id = ${req.workspaceId}
    `;
    if (!job) return reply.status(404).send({ error: 'Job not found' });

    const rows = await sql`
      SELECT id, job_id, status, profiles_found, error_message,
             started_at, completed_at, created_at
      FROM related_profile_discoveries
      WHERE job_id = ${req.params.id} AND workspace_id = ${req.workspaceId}
      ORDER BY created_at DESC
      LIMIT 10
    `;
    return rows.map((row) => formatDiscovery(row as Record<string, unknown>));
  });

  app.post<{
    Params: { id: string };
    Body: { linkedin_urls?: string[]; limit?: number; search_country?: string };
  }>(
    '/jobs/:id/related-profiles/discover',
    { preHandler: requireRole('recruiter') },
    async (req, reply) => {
      const jobId = req.params.id;
      const [job] = await sql`
        SELECT id, name, description, screening_model
        FROM job_profiles
        WHERE id = ${jobId} AND workspace_id = ${req.workspaceId}
      `;
      if (!job) return reply.status(404).send({ error: 'Job not found' });

      const description = (job.description as string | null)?.trim();
      if (!description) {
        return reply.status(400).send({
          error: 'Add a job description before discovering related profiles.',
        });
      }

      const settings = await getWorkspaceSettings(req.workspaceId);
      const keys = await getWorkspaceKeys(req.workspaceId);
      const preferredModel =
        (job.screeningModel as string | null) || settings.default_model || 'claude-sonnet-4-6';
      const { modelId } = pickRunnableModel(preferredModel, settings.allowed_models, keys);

      const [discovery] = await sql`
        INSERT INTO related_profile_discoveries (job_id, workspace_id, status, started_at)
        VALUES (${jobId}, ${req.workspaceId}, 'in_progress', now())
        RETURNING id
      `;

      try {
        const { profiles: discovered, searchQuery, urlsFound, searchProvider, locationQuery, locationScope } =
          await discoverSimilarProfiles({
            jobTitle: job.name as string,
            jobDescription: description,
            linkedinUrls: req.body?.linkedin_urls,
            limit: req.body?.limit ?? 10,
            modelId,
            keys,
            searchCountry: req.body?.search_country,
          });

        let saved = 0;
        const autoScore = process.env.RELATED_PROFILES_AUTO_SCORE === 'true';

        for (const profile of discovered) {
          let stars: number | null = null;
          let rationale: string | null = null;

          if (autoScore) {
            const alignment = await scoreJdAlignment(
              {
                jobTitle: job.name as string,
                jobDescription: description,
                profile: {
                  name: profile.name,
                  title: profile.title,
                  company: profile.company,
                  location: profile.location,
                  headline: profile.headline,
                  profileSummary: profile.profileSummary,
                  workExperience: profile.workExperience,
                  education: profile.education,
                },
                modelId,
              },
              keys,
            );
            stars = alignment.stars;
            rationale = alignment.rationale;
          }

          await sql`
            INSERT INTO related_profiles (
              job_id, workspace_id, discovery_id, name, title, company, location,
              linkedin_url, headline, profile_summary, alignment_stars,
              alignment_rationale, source
            ) VALUES (
              ${jobId}, ${req.workspaceId}, ${discovery.id}, ${profile.name},
              ${profile.title ?? null}, ${profile.company ?? null}, ${profile.location ?? null},
              ${profile.linkedinUrl ?? null}, ${profile.headline ?? null},
              ${profile.profileSummary}, ${stars}, ${rationale}, 'linkedin'
            )
            ON CONFLICT (job_id, linkedin_url) WHERE linkedin_url IS NOT NULL
            DO UPDATE SET
              name = EXCLUDED.name,
              title = EXCLUDED.title,
              company = EXCLUDED.company,
              location = EXCLUDED.location,
              headline = EXCLUDED.headline,
              profile_summary = EXCLUDED.profile_summary,
              discovery_id = EXCLUDED.discovery_id,
              discovered_at = now(),
              alignment_stars = COALESCE(related_profiles.alignment_stars, EXCLUDED.alignment_stars),
              alignment_rationale = COALESCE(related_profiles.alignment_rationale, EXCLUDED.alignment_rationale)
          `;
          saved += 1;
        }

        await sql`
          UPDATE related_profile_discoveries
          SET status = 'completed', profiles_found = ${saved}, completed_at = now()
          WHERE id = ${discovery.id}
        `;

        await writeAuditLog({
          req,
          action: 'related_profiles.discover',
          entityType: 'job',
          entityId: jobId,
          payload: {
            profiles_found: saved,
            search_query: searchQuery,
            urls_found: urlsFound,
            search_provider: searchProvider,
            location_query: locationQuery ?? null,
            location_scope: locationScope ?? null,
          },
        });

        const profiles = await sql`
          SELECT id, job_id, name, title, company, location, linkedin_url, headline,
                 profile_summary, alignment_stars, alignment_rationale, source,
                 discovered_at, created_at
          FROM related_profiles
          WHERE job_id = ${jobId} AND workspace_id = ${req.workspaceId}
          ORDER BY alignment_stars DESC NULLS LAST, discovered_at DESC
        `;

        return {
          discovery_id: discovery.id,
          profiles_found: saved,
          search_query: searchQuery,
          urls_found: urlsFound,
          search_provider: searchProvider,
          location_query: locationQuery ?? null,
          location_scope: locationScope ?? null,
          profiles: profiles.map((row) => formatRelatedProfile(row as Record<string, unknown>)),
        };
      } catch (err) {
        if (err instanceof NeedsCountryError) {
          await sql`DELETE FROM related_profile_discoveries WHERE id = ${discovery.id}`;
          return reply.status(422).send({ error: err.message, needs_country: true });
        }
        const message = err instanceof Error ? err.message : 'Discovery failed';
        await sql`
          UPDATE related_profile_discoveries
          SET status = 'failed', error_message = ${message}, completed_at = now()
          WHERE id = ${discovery.id}
        `;
        return reply.status(500).send({ error: message });
      }
    },
  );

  app.delete<{ Params: { id: string; profileId: string } }>(
    '/jobs/:id/related-profiles/:profileId',
    { preHandler: requireRole('recruiter') },
    async (req, reply) => {
      const result = await sql`
        DELETE FROM related_profiles
        WHERE id = ${req.params.profileId}
          AND job_id = ${req.params.id}
          AND workspace_id = ${req.workspaceId}
        RETURNING id
      `;
      if (!result.length) return reply.status(404).send({ error: 'Profile not found' });
      return { success: true };
    },
  );
}
