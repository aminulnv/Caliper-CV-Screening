import type { CandidateDisposition } from '@/services/api';
import {
  candidateTargetStageId,
  candidateTargetStageName,
} from '@/lib/recruitee-pipeline';

export function dispositionDisplayLabel(
  candidate: {
    disposition?: CandidateDisposition | null;
    target_stage_name?: string | null;
    targetStageName?: string | null;
    target_stage_id?: string | null;
    targetStageId?: string | null;
  },
  options?: { recruiteePipeline?: boolean },
): string | null {
  const disposition = candidate.disposition ?? null;
  if (!disposition) return null;

  const stageName = candidateTargetStageName(candidate);
  const recruitee = options?.recruiteePipeline ?? false;

  if (disposition === 'advanced' || (disposition === 'shortlist' && stageName)) {
    return stageName ?? (disposition === 'shortlist' ? 'Shortlisted' : 'Advanced');
  }
  if (disposition === 'shortlist') return recruitee ? 'Shortlisted' : 'Shortlisted';
  if (disposition === 'reject') return recruitee ? 'Disqualified' : 'Rejected';
  if (disposition === 'hold') return recruitee ? 'On hold (Caliper)' : 'On hold';
  return disposition;
}

export function dispositionBadgeTone(
  disposition: CandidateDisposition,
): string {
  if (disposition === 'shortlist' || disposition === 'advanced') return 'ok';
  if (disposition === 'hold') return 'warn';
  if (disposition === 'reject') return 'bad';
  return 'default';
}

export function matchesPipelineFilter(
  candidate: {
    disposition?: CandidateDisposition | null;
    target_stage_id?: string | null;
    targetStageId?: string | null;
  },
  filter: string,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'undecided') return !candidate.disposition;
  if (filter === 'hold') return candidate.disposition === 'hold';
  if (filter === 'reject') return candidate.disposition === 'reject';
  if (filter.startsWith('stage:')) {
    const stageId = filter.slice(6);
    const targetId = candidateTargetStageId(candidate);
    if (targetId === stageId) return true;
    return false;
  }
  return candidate.disposition === filter;
}

export function countCandidatesByStage(
  candidates: Array<{
    disposition?: CandidateDisposition | null;
    target_stage_id?: string | null;
    targetStageId?: string | null;
  }>,
  stageId: string,
): number {
  return candidates.filter((c) => candidateTargetStageId(c) === stageId).length;
}
