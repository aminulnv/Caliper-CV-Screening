import { sql } from './db.js';
import { screeningRunAccessible } from '../lib/run-access.js';
import { formatRunCandidateRow } from '../lib/run-candidate-format.js';
import { getRecruiteeCredentials } from './workspace.js';
import {
  changeCandidateStageForOffer,
  changePlacementStage,
  disqualifyCandidateForOffer,
  disqualifyPlacement,
  qualifyCandidateForOffer,
  qualifyPlacement,
} from './recruitee-write.js';
import { fetchRecruiteePlacementIdForOffer } from './recruitee.js';

export const DISPOSITION_VALUES = ['shortlist', 'hold', 'reject', 'advanced'] as const;
export type DispositionValue = (typeof DISPOSITION_VALUES)[number];

export type SetDispositionInput = {
  disposition: DispositionValue;
  targetStageId?: string | null;
  targetStageName?: string | null;
  note?: string | null;
  pushToRecruitee?: boolean;
  /** When true, use Recruitee proceed on change_stage to re-qualify disqualified candidates. */
  requalify?: boolean;
};

export type DispositionResult = {
  candidate: ReturnType<typeof formatRunCandidateRow>;
  syncStatus: string | null;
  syncError: string | null;
};

type RunCandidateContext = {
  id: string;
  runId: string;
  jobId: string;
  name: string | null;
  recruiteeApplicantId: string | null;
  recruiteePlacementId: string | null;
  jobSource: string;
  jobSourceRef: string | null;
  shortlistStageId: string | null;
  shortlistStageName: string | null;
};

export async function getRunCandidateContext(
  runId: string,
  candidateId: string,
  workspaceId: string,
  userId: string,
): Promise<RunCandidateContext | null> {
  const [row] = await sql`
    SELECT rc.id, rc.run_id, rc.name,
           rc.recruitee_applicant_id, rc.recruitee_placement_id,
           sr.job_id, jp.source, jp.source_ref,
           jp.shortlist_stage_id, jp.shortlist_stage_name
    FROM run_candidates rc
    JOIN screening_runs sr ON rc.run_id = sr.id
    JOIN job_profiles jp ON sr.job_id = jp.id
    WHERE rc.id = ${candidateId}
      AND rc.run_id = ${runId}
      AND sr.workspace_id = ${workspaceId}
      AND ${screeningRunAccessible(userId)}
  `;
  if (!row) return null;

  return {
    id: row.id as string,
    runId: (row.runId ?? row.run_id) as string,
    jobId: (row.jobId ?? row.job_id) as string,
    name: (row.name as string | null) ?? null,
    recruiteeApplicantId: (row.recruiteeApplicantId ?? row.recruitee_applicant_id) as string | null,
    recruiteePlacementId: (row.recruiteePlacementId ?? row.recruitee_placement_id) as string | null,
    jobSource: (row.source as string) ?? 'manual',
    jobSourceRef: (row.sourceRef ?? row.source_ref) as string | null,
    shortlistStageId: (row.shortlistStageId ?? row.shortlist_stage_id ?? null) as string | null,
    shortlistStageName: (row.shortlistStageName ?? row.shortlist_stage_name ?? null) as string | null,
  };
}

function resolvePushStageId(
  disposition: DispositionValue,
  input: SetDispositionInput,
  ctx: RunCandidateContext,
): string | null {
  if (disposition === 'advanced') return input.targetStageId?.trim() || null;
  if (disposition === 'shortlist') {
    return input.targetStageId?.trim() || ctx.shortlistStageId;
  }
  return null;
}

async function resolvePlacementId(
  ctx: RunCandidateContext,
  workspaceId: string,
): Promise<string | null> {
  if (ctx.recruiteePlacementId) return ctx.recruiteePlacementId;
  if (!ctx.recruiteeApplicantId || !ctx.jobSourceRef) return null;

  try {
    const creds = await getRecruiteeCredentials(workspaceId);
    const placementId = await fetchRecruiteePlacementIdForOffer(
      creds.baseUrl,
      creds.apiKey,
      ctx.recruiteeApplicantId,
      ctx.jobSourceRef,
    );
    if (placementId) {
      await sql`
        UPDATE run_candidates SET recruitee_placement_id = ${placementId}
        WHERE id = ${ctx.id}
      `;
    }
    return placementId;
  } catch {
    return null;
  }
}

async function pushDispositionToRecruitee(
  ctx: RunCandidateContext,
  workspaceId: string,
  disposition: DispositionValue,
  stageId: string | null,
  requalify = false,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (ctx.jobSource !== 'recruitee') {
    return { ok: false, error: 'Job is not linked to Recruitee' };
  }
  if (!ctx.recruiteeApplicantId) {
    return { ok: false, error: 'Candidate is not linked to a Recruitee applicant' };
  }
  if (!ctx.jobSourceRef) {
    return { ok: false, error: 'Job has no Recruitee offer id' };
  }

  const creds = await getRecruiteeCredentials(workspaceId);
  const placementId = await resolvePlacementId(ctx, workspaceId);

  try {
    if (disposition === 'reject') {
      if (placementId) {
        await disqualifyPlacement(creds.baseUrl, creds.apiKey, placementId);
      } else {
        await disqualifyCandidateForOffer(
          creds.baseUrl,
          creds.apiKey,
          ctx.recruiteeApplicantId,
          ctx.jobSourceRef,
        );
      }
      return { ok: true };
    }

    if (disposition === 'hold') {
      return { ok: false, error: 'Hold does not sync to Recruitee' };
    }

    if (!stageId) {
      return {
        ok: false,
        error:
          disposition === 'shortlist'
            ? 'Configure a shortlist stage on the job Criteria tab before pushing'
            : 'Target stage is required to push to Recruitee',
      };
    }

    if (requalify) {
      if (placementId) {
        await qualifyPlacement(creds.baseUrl, creds.apiKey, placementId, stageId);
      } else {
        await qualifyCandidateForOffer(
          creds.baseUrl,
          creds.apiKey,
          ctx.recruiteeApplicantId,
          ctx.jobSourceRef,
          stageId,
        );
      }
    } else if (placementId) {
      await changePlacementStage(creds.baseUrl, creds.apiKey, placementId, stageId);
    } else {
      await changeCandidateStageForOffer(
        creds.baseUrl,
        creds.apiKey,
        ctx.recruiteeApplicantId,
        ctx.jobSourceRef,
        stageId,
      );
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export async function setCandidateDisposition(
  runId: string,
  candidateId: string,
  workspaceId: string,
  userId: string,
  input: SetDispositionInput,
): Promise<
  | { ok: false; status: number; error: string }
  | ({ ok: true } & DispositionResult)
> {
  if (!DISPOSITION_VALUES.includes(input.disposition)) {
    return { ok: false, status: 400, error: 'Invalid disposition' };
  }

  const ctx = await getRunCandidateContext(runId, candidateId, workspaceId, userId);
  if (!ctx) return { ok: false, status: 404, error: 'Candidate not found' };

  if (input.disposition === 'advanced' && !input.targetStageId?.trim()) {
    return { ok: false, status: 400, error: 'target_stage_id is required for advanced disposition' };
  }

  const pushRequested = Boolean(input.pushToRecruitee);
  if (pushRequested && ctx.jobSource !== 'recruitee') {
    return { ok: false, status: 400, error: 'Recruitee push is only available for Recruitee-linked jobs' };
  }

  const pushStageId = resolvePushStageId(input.disposition, input, ctx);
  const targetStageIdRaw =
    input.disposition === 'advanced' || input.disposition === 'shortlist'
      ? (input.targetStageId?.trim()
        || (input.disposition === 'shortlist' ? ctx.shortlistStageId : null))
      : null;
  const targetStageId = targetStageIdRaw ?? null;
  const targetStageNameRaw =
    input.targetStageName?.trim()
    || (targetStageId && input.disposition === 'shortlist' ? ctx.shortlistStageName : null);
  const targetStageName = targetStageNameRaw ?? null;
  const dispositionNote = input.note?.trim() ?? null;

  let syncStatus: string | null = pushRequested ? 'skipped' : null;
  let syncError: string | null = null;
  let syncedAt: Date | null = null;

  if (pushRequested) {
    if (input.disposition === 'hold') {
      syncStatus = 'skipped';
    } else {
      syncStatus = 'pending';
      const pushResult = await pushDispositionToRecruitee(
        ctx,
        workspaceId,
        input.disposition,
        pushStageId,
        Boolean(input.requalify),
      );
      if (pushResult.ok) {
        syncStatus = 'synced';
        syncedAt = new Date();
      } else {
        syncStatus = 'failed';
        syncError = pushResult.error;
      }
    }
  }

  const [updated] = await sql`
    UPDATE run_candidates
    SET disposition = ${input.disposition},
        target_stage_id = ${targetStageId ?? null},
        target_stage_name = ${targetStageName ?? null},
        disposition_note = ${dispositionNote},
        disposition_by = ${userId},
        disposition_at = NOW(),
        recruitee_sync_status = ${syncStatus ?? null},
        recruitee_synced_at = ${syncedAt ?? null},
        recruitee_sync_error = ${syncError ?? null}
    WHERE id = ${candidateId}
    RETURNING id, name, title, location, score, confidence, status, summary,
              parse_warning, must_met, nice_met, flag_triggered,
              score_base, penalty_flag,
              must_total, nice_total, flag_total,
              criteria_met_pct, must_met_pct, nice_met_pct,
              cv_storage_path, recruitee_applicant_id, applicant_email, run_id,
              disposition, target_stage_id, target_stage_name, disposition_note,
              disposition_by, disposition_at, recruitee_placement_id,
              recruitee_sync_status, recruitee_synced_at, recruitee_sync_error
  `;

  return {
    ok: true,
    candidate: formatRunCandidateRow(updated as Record<string, unknown>),
    syncStatus,
    syncError,
  };
}

export async function pushCandidateDispositionToRecruitee(
  runId: string,
  candidateId: string,
  workspaceId: string,
  userId: string,
): Promise<
  | { ok: false; status: number; error: string }
  | ({ ok: true } & DispositionResult)
> {
  const ctx = await getRunCandidateContext(runId, candidateId, workspaceId, userId);
  if (!ctx) return { ok: false, status: 404, error: 'Candidate not found' };

  const [current] = await sql`
    SELECT disposition, target_stage_id, target_stage_name
    FROM run_candidates WHERE id = ${candidateId}
  `;
  const disposition = (current?.disposition as DispositionValue | null) ?? null;
  if (!disposition) {
    return { ok: false, status: 400, error: 'Set a Caliper disposition before pushing to Recruitee' };
  }

  const pushStageId =
    disposition === 'advanced' || disposition === 'shortlist'
      ? ((current?.targetStageId ?? current?.target_stage_id) as string | null)
        || (disposition === 'shortlist' ? ctx.shortlistStageId : null)
      : null;

  const pushResult = await pushDispositionToRecruitee(ctx, workspaceId, disposition, pushStageId);
  if (!pushResult.ok) {
    await sql`
      UPDATE run_candidates
      SET recruitee_sync_status = 'failed',
          recruitee_sync_error = ${pushResult.error}
      WHERE id = ${candidateId}
    `;
    return { ok: false, status: 400, error: pushResult.error };
  }

  const [updated] = await sql`
    UPDATE run_candidates
    SET recruitee_sync_status = 'synced',
        recruitee_synced_at = NOW(),
        recruitee_sync_error = NULL
    WHERE id = ${candidateId}
    RETURNING id, name, title, location, score, confidence, status, summary,
              parse_warning, must_met, nice_met, flag_triggered,
              score_base, penalty_flag,
              must_total, nice_total, flag_total,
              criteria_met_pct, must_met_pct, nice_met_pct,
              cv_storage_path, recruitee_applicant_id, applicant_email, run_id,
              disposition, target_stage_id, target_stage_name, disposition_note,
              disposition_by, disposition_at, recruitee_placement_id,
              recruitee_sync_status, recruitee_synced_at, recruitee_sync_error
  `;

  return {
    ok: true,
    candidate: formatRunCandidateRow(updated as Record<string, unknown>),
    syncStatus: 'synced',
    syncError: null,
  };
}
