// @ts-nocheck
// Page — Run results for /runs/:runId
import React from 'react'
import { Icon, Btn, IconBtn, ScoreBar, Confidence, StatusBadge, Badge, PageLoading, PageError } from '@/caliper/ui'
import { api } from '@/services/api'
import type { RunDetail, CandidateRow, CandidateEvaluationResponse, EvaluationItem, CompareRunResponse } from '@/services/api'
import { CriteriaChecklistPanel, ChecklistSummary } from '@/caliper/components/CriteriaChecklist'
import { CandidateCompareSheet } from '@/caliper/components/CandidateCompareSheet'
import { CandidateHistoryPanel } from '@/caliper/components/CandidateHistoryPanel'
import { CvViewer } from '@/caliper/components/CvViewer'
import { CvQuotesPanel } from '@/caliper/components/CvQuotesPanel'
import { countsFromCandidateRow } from '@/lib/criteria-checklist'
import { RunAccessControl } from '@/caliper/components/RunAccessControl'
import { DispositionBadge } from '@/caliper/components/DispositionBadge'
import { PushRecruiteeModal } from '@/caliper/components/PushRecruiteeModal'
import { PipelineStageActions } from '@/caliper/components/PipelineStageActions'
import { useAuth } from '@/contexts/AuthContext'
import type { WorkspaceMember, CandidateDisposition, RecruiteePipelineStage, SetDispositionBody } from '@/services/api'
import { memberUserId, parseSharedUserIds } from '@/lib/run-share'
import { groupPipelineStages } from '@/lib/recruitee-pipeline'
import {
  dispositionDisplayLabel,
  matchesPipelineFilter,
  countCandidatesByStage,
} from '@/lib/candidate-disposition-display'
import { shapeJobRow } from '@/lib/job-profile'
import { getCachedApplicants, loadRecruiteeApplicants, invalidateApplicants } from '@/lib/applicants-cache'
import { matchesTextQuery } from '@/lib/text-search'

const confOrder = (c) => c === 'high' ? 3 : c === 'medium' ? 2 : 1;

function candidateMetrics(c) {
  const counts = countsFromCandidateRow(c);
  return {
    mustMet: c.must_met ?? c.mustMet ?? counts?.mustMet ?? 0,
    niceMet: c.nice_met ?? c.niceMet ?? counts?.niceMet ?? 0,
    flagTriggered: c.flag_triggered ?? c.flagTriggered ?? counts?.flagTriggered ?? 0,
    criteriaMetPct: c.criteria_met_pct ?? c.criteriaMetPct ?? counts?.criteriaMetPct ?? null,
    scoreBase: c.score_base ?? c.scoreBase ?? null,
    penaltyFlag: c.penalty_flag ?? c.penaltyFlag ?? 0,
    qualityAdjustment: c.quality_adjustment ?? c.qualityAdjustment ?? 0,
    cvQualityScore: c.cv_quality_score ?? c.cvQualityScore ?? null,
  };
}

function ScoreDeductionBreakdown({ candidate }) {
  const { criteriaMetPct, scoreBase, penaltyFlag, cvQualityScore } = candidateMetrics(candidate);
  const pct = criteriaMetPct ?? scoreBase;
  if (pct == null) return null;
  const flagPen = penaltyFlag;
  const final = candidate.score ?? 0;

  if (cvQualityScore != null) {
    return (
      <span className="score-deduction mono" style={{ fontSize: 11 }}>
        Checklist <strong>{pct}%</strong>
        {' · '}CV quality <strong style={{ color: cvQualityScore < 55 ? 'var(--warn-ink)' : 'var(--ink)' }}>{cvQualityScore}/100</strong>
        {flagPen > 0 && <> · Flags −<strong style={{ color: 'var(--bad-ink)' }}>{flagPen}</strong></>}
        {' → '}<strong style={{ color: 'var(--ink)' }}>{final}</strong>
      </span>
    );
  }

  if (flagPen === 0) {
    return (
      <span className="mono muted" style={{ fontSize: 11 }}>
        Checklist {pct}% → <strong style={{ color: 'var(--ink)' }}>{final}</strong>
      </span>
    );
  }
  return (
    <span className="score-deduction mono" style={{ fontSize: 11 }}>
      Checklist <strong>{pct}%</strong>
      {flagPen > 0 && <> − Flags <strong style={{ color: 'var(--bad-ink)' }}>{flagPen}</strong></>}
      {' '}= <strong style={{ color: 'var(--ink)' }}>{final}</strong>
    </span>
  );
}

const MAX_COMPARE = 4;

function matchesStatusFilter(candidate, filterStatus) {
  if (filterStatus === 'all') return true;
  if (filterStatus === 'review_flagged') {
    return candidate.status === 'review' || candidate.status === 'flagged';
  }
  return candidate.status === filterStatus;
}

function matchesDispositionFilter(candidate, filterDisposition) {
  return matchesPipelineFilter(candidate, filterDisposition);
}

/** Live Recruitee state for a run candidate, keyed by its Recruitee applicant id. */
function recruiteeStateFor(candidate, stateById) {
  const applicantId = candidate?.recruitee_applicant_id ?? candidate?.recruiteeApplicantId ?? null;
  if (!applicantId || !stateById) return null;
  return stateById.get(String(applicantId)) ?? null;
}

function selectionNeedsRequalify(candidateIds, candidates, stateById) {
  return candidateIds.some((id) => {
    const candidate = candidates.find((c) => c.id === id);
    return candidateShowsDisqualified(candidate, stateById, true);
  });
}

/** True when the candidate is in Recruitee's disqualified pipeline (live state preferred). */
function candidateShowsDisqualified(candidate, stateById, useRecruiteePipeline = false) {
  const rState = recruiteeStateFor(candidate, stateById);
  if (rState) return Boolean(rState.disqualified);
  if (useRecruiteePipeline && candidate?.disposition === 'reject') return true;
  return false;
}

const STATUS_SORT_ORDER = { strong: 0, promising: 1, review: 2, flagged: 3 };

function candidateSortValue(candidate, key, stateById) {
  const metrics = candidateMetrics(candidate);
  switch (key) {
    case 'rank':
    case 'score':
      return candidate.score ?? -1;
    case 'candidate':
      return (candidate.name ?? '').toLowerCase();
    case 'pct_met':
      return metrics.criteriaMetPct ?? -1;
    case 'confidence':
      return confOrder(candidate.confidence);
    case 'status':
      return STATUS_SORT_ORDER[candidate.status] ?? 9;
    case 'pipeline': {
      const state = recruiteeStateFor(candidate, stateById);
      if (state?.disqualified) return '\u0000disqualified';
      return (state?.stageName ?? candidate.target_stage_name ?? 'zzz').toLowerCase();
    }
    default:
      return 0;
  }
}

function sortCandidates(list, sortState, stateById) {
  if (!sortState) return list;
  const mult = sortState.dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const va = candidateSortValue(a, sortState.key, stateById);
    const vb = candidateSortValue(b, sortState.key, stateById);
    if (typeof va === 'string' && typeof vb === 'string') {
      return mult * va.localeCompare(vb);
    }
    return mult * (Number(va) - Number(vb));
  });
}

function cycleTableSort(prev, key) {
  if (prev?.key !== key) return { key, dir: 'desc' };
  if (prev.dir === 'desc') return { key, dir: 'asc' };
  return null;
}

function ResultsSortableTh({ label, sortKey, sortState, onSort, style, className }) {
  const active = sortState?.key === sortKey;
  const dir = active ? sortState.dir : null;
  return (
    <th
      className={[
        'tbl-sort-th',
        active ? 'tbl-sort-th--active' : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
      style={style}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" className="tbl-sort-btn" onClick={() => onSort(sortKey)}>
        <span>{label}</span>
        {active && (
          <span className="tbl-sort-indicator" aria-hidden>
            {dir === 'desc' ? '↓' : '↑'}
          </span>
        )}
      </button>
    </th>
  );
}

/** Reflects where a candidate actually sits in Recruitee right now (stage or disqualified). */
function RecruiteeStatusBadge({ state, compact = false }) {
  if (!state) return null;
  if (state.disqualified) {
    return (
      <span
        className="disposition-badge-wrap"
        title={state.disqualifyReason ? `Disqualified in Recruitee — ${state.disqualifyReason}` : 'Disqualified in Recruitee'}
      >
        <Badge tone="bad" dot>Disqualified</Badge>
      </span>
    );
  }
  if (state.stageName) {
    const label = compact && state.stageName.length > 22 ? `${state.stageName.slice(0, 20)}…` : state.stageName;
    return (
      <span className="disposition-badge-wrap" title={`In Recruitee — ${state.stageName}`}>
        <Badge tone="default" dot>{label}</Badge>
      </span>
    );
  }
  return null;
}

const DISPOSITION_LABELS = {
  shortlist: 'Shortlist',
  hold: 'Hold',
  reject: 'Reject',
  advanced: 'Move to stage',
};

function dispositionSuccessLabel(
  body: SetDispositionBody,
  candidateName?: string | null,
  useRecruiteePipeline?: boolean,
): string {
  const who = candidateName ?? 'Candidate';
  if (body.requalify && body.target_stage_name) {
    return `${who} re-qualified to ${body.target_stage_name}.`;
  }
  if (body.target_stage_name) {
    return `${who} moved to ${body.target_stage_name}.`;
  }
  if (body.disposition === 'reject') {
    return `${who} marked as ${useRecruiteePipeline ? 'disqualified' : 'rejected'}.`;
  }
  const label = DISPOSITION_LABELS[body.disposition] ?? body.disposition;
  return `${who} marked as ${label}.`;
}

function ResultsPage({ tweaks, route, go }) {
  const { displayName, avatarUrl, user, canEdit } = useAuth();
  const runId = route?.runId ?? route?.run;

  React.useEffect(() => {
    if (!runId && typeof go === 'function') go('runs');
  }, [runId, go]);

  const [run, setRun] = React.useState<RunDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [compareSelection, setCompareSelection] = React.useState<string[]>([]);
  const [compareOpen, setCompareOpen] = React.useState(false);
  const [compareLoading, setCompareLoading] = React.useState(false);
  const [compareError, setCompareError] = React.useState<string | null>(null);
  const [compareData, setCompareData] = React.useState<CompareRunResponse | null>(null);
  const [sortState, setSortState] = React.useState({ key: 'score', dir: 'desc' });
  const [filterStatus, setFilterStatus] = React.useState('all');
  const [filterDisposition, setFilterDisposition] = React.useState('all');
  const [candidateSearchQuery, setCandidateSearchQuery] = React.useState('');
  const [pipelineStages, setPipelineStages] = React.useState<RecruiteePipelineStage[]>([]);
  const [pipelineStagesLoading, setPipelineStagesLoading] = React.useState(false);
  const [pipelineStagesError, setPipelineStagesError] = React.useState<string | null>(null);
  const [recruiteeStateById, setRecruiteeStateById] = React.useState<Map<string, {
    disqualified: boolean;
    stageId: string | null;
    stageName: string | null;
    disqualifyReason: string | null;
  }>>(() => new Map());
  const [recruiteeQual, setRecruiteeQual] = React.useState<'all' | 'qualified' | 'disqualified'>('all');
  const [platformActor, setPlatformActor] = React.useState('platform integration account');
  const [jobSource, setJobSource] = React.useState<string | null>(null);
  const [jobSourceRef, setJobSourceRef] = React.useState<string | null>(null);
  const [dispositionBusy, setDispositionBusy] = React.useState(false);
  const [dispositionError, setDispositionError] = React.useState<string | null>(null);
  const [dispositionSuccess, setDispositionSuccess] = React.useState<string | null>(null);
  const [pushModal, setPushModal] = React.useState<{
    disposition: CandidateDisposition;
    candidateIds: string[];
    targetStageId?: string;
    targetStageName?: string;
    requalify?: boolean;
  } | null>(null);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [members, setMembers] = React.useState<WorkspaceMember[] | null>(null);
  const [membersLoading, setMembersLoading] = React.useState(false);

  React.useEffect(() => {
    if (!runId) return;
    setLoading(true);
    api.runs.get(runId)
      .then((data) => { setRun(data); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [runId]);

  // Poll for status updates while run is in_progress (replaces Supabase Realtime)
  React.useEffect(() => {
    if (!runId || !run || run.status !== 'in_progress') return;
    const interval = setInterval(() => {
      api.runs.get(runId)
        .then((data) => {
          setRun(data);
          if (data.status !== 'in_progress') clearInterval(interval);
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [runId, run?.status]);

  React.useEffect(() => {
    setSelected(null);
    setCompareSelection([]);
    setCompareOpen(false);
    setCompareData(null);
    setFilterStatus('all');
    setFilterDisposition('all');
    setRecruiteeQual('all');
    setSortState({ key: 'score', dir: 'desc' });
    setShareOpen(false);
    setDispositionError(null);
    setDispositionSuccess(null);
  }, [runId]);

  const loadPipelineStages = React.useCallback(async (
    jobId: string,
    source: string | null,
    sourceRef: string | null,
  ) => {
    const recruiteeLinked = source === 'recruitee' && Boolean(sourceRef);
    setPipelineStagesLoading(true);
    setPipelineStagesError(null);

    const applyStages = (stages: RecruiteePipelineStage[]) => {
      setPipelineStages(stages);
      if (stages.length === 0 && recruiteeLinked) {
        setPipelineStagesError(
          'No pipeline stages returned from Recruitee for this job. Open the job in Jobs → Applicants to verify the connection.',
        );
      }
    };

    const tryApplicantsFallback = async (): Promise<RecruiteePipelineStage[]> => {
      if (!sourceRef) return [];
      const cached = getCachedApplicants(sourceRef);
      const data = cached ?? await loadRecruiteeApplicants(sourceRef);
      return data.pipeline?.stages ?? [];
    };

    try {
      const res = await api.jobs.pipelineStages(jobId);
      if (res.platform_actor) setPlatformActor(res.platform_actor);
      let stages = res.stages ?? [];

      if (stages.length === 0 && recruiteeLinked && sourceRef) {
        try {
          stages = await tryApplicantsFallback();
        } catch {
          // Keep primary error messaging below if both paths fail.
        }
      }

      applyStages(stages);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not load Recruitee pipeline stages';
      setPipelineStages([]);

      if (recruiteeLinked && sourceRef) {
        try {
          const stages = await tryApplicantsFallback();
          if (stages.length > 0) {
            applyStages(stages);
            return;
          }
        } catch {
          // Fall through to error banner.
        }
        setPipelineStagesError(message);
      }
    } finally {
      setPipelineStagesLoading(false);
    }
  }, []);

  const jobId = run?.job_id ?? run?.jobId ?? null;

  React.useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    api.jobs.get(jobId)
      .then((job) => {
        if (cancelled) return;
        const shaped = shapeJobRow(job as Record<string, unknown>);
        setJobSource(shaped.source ?? null);
        setJobSourceRef(shaped.sourceRef ?? null);
        void loadPipelineStages(jobId, shaped.source ?? null, shaped.sourceRef ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setJobSource(null);
        setJobSourceRef(null);
        setPipelineStages([]);
        setPipelineStagesError(null);
      });

    api.settings.get()
      .then((s) => {
        if (!cancelled && s.recruitee_platform_actor_label) {
          setPlatformActor(s.recruitee_platform_actor_label);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [jobId, loadPipelineStages]);

  // Overlay each candidate's live Recruitee state (current stage / disqualified)
  // so the page reflects the ATS instead of only the last Caliper decision.
  React.useEffect(() => {
    const linked = jobSource === 'recruitee' && Boolean(jobSourceRef);
    if (!linked || !jobSourceRef) {
      setRecruiteeStateById(new Map());
      return;
    }
    let cancelled = false;
    const sourceRef = jobSourceRef;

    const buildMap = (applicants: Array<Record<string, unknown>>) => {
      const map = new Map();
      for (const applicant of applicants ?? []) {
        if (applicant?.id == null) continue;
        map.set(String(applicant.id), {
          disqualified: Boolean(applicant.disqualified),
          stageId: (applicant.stage_id as string | null) ?? null,
          stageName: (applicant.stage_name as string | null) ?? null,
          disqualifyReason: (applicant.disqualify_reason as string | null) ?? null,
        });
      }
      return map;
    };

    const cached = getCachedApplicants(sourceRef);
    if (cached) setRecruiteeStateById(buildMap(cached.applicants));

    loadRecruiteeApplicants(sourceRef, { force: true })
      .then((data) => {
        if (!cancelled) setRecruiteeStateById(buildMap(data.applicants));
      })
      .catch(() => {
        if (!cancelled && !cached) setRecruiteeStateById(new Map());
      });

    return () => { cancelled = true; };
  }, [jobSource, jobSourceRef]);

  const openShareMenu = () => {
    setShareOpen(true);
    if (!members && !membersLoading) {
      setMembersLoading(true);
      api.workspace.listMembers()
        .then((res) => setMembers(res.members))
        .catch(() => setMembers([]))
        .finally(() => setMembersLoading(false));
    }
  };

  const toggleShare = (member) => {
    const activeRunId = run?.id;
    if (!activeRunId) return;

    const memberId = memberUserId(member);
    if (!memberId) return;

    let nextIds;
    let rollback;

    setRun((prev) => {
      if (!prev) return prev;

      const current = parseSharedUserIds(prev.shared_user_ids, prev.shared_users);
      const currentShared = Array.isArray(prev.shared_users) ? prev.shared_users : [];
      rollback = { shared_user_ids: current, shared_users: currentShared };

      const isRemoving = current.some((id) => String(id) === memberId);
      nextIds = isRemoving
        ? current.filter((id) => String(id) !== memberId)
        : [...current, memberId];
      const nextShared = isRemoving
        ? currentShared.filter((u) => String(u.user_id ?? u.userId) !== memberId)
        : [...currentShared, {
            user_id: memberId,
            name: member.name,
            email: member.email,
            avatar_url: member.avatar_url,
          }];

      return { ...prev, shared_user_ids: nextIds, shared_users: nextShared };
    });

    if (!nextIds) return;

    api.runs.setShares(activeRunId, nextIds).catch(() => {
      if (!rollback) return;
      setRun((prev) => (prev ? { ...prev, ...rollback } : prev));
    });
  };

  const toggleCompareSelect = (id: string) => {
    setCompareSelection((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, id];
    });
  };

  const openCompare = async () => {
    if (compareSelection.length < 2 || !runId) return;
    setCompareOpen(true);
    setCompareLoading(true);
    setCompareError(null);
    setCompareData(null);
    try {
      const data = await api.runs.compare(runId, compareSelection);
      setCompareData(data);
    } catch (e) {
      setCompareError(e instanceof Error ? e.message : 'Could not load comparison');
    } finally {
      setCompareLoading(false);
    }
  };

  const openCandidateFromCompare = (candidateId: string) => {
    setCompareOpen(false);
    setSelected(candidateId);
  };

  const updateCandidateInRun = (updated, scoreRange) => {
    setRun((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        score_range: scoreRange ?? prev.score_range,
        candidates: (prev.candidates ?? []).map((c) =>
          c.id === updated.id ? { ...c, ...updated } : c
        ),
      };
    });
  };

  // Reflect a synced Caliper action on the live Recruitee overlay immediately,
  // so a just-disqualified/moved candidate updates without waiting on the cache.
  const applyLiveRecruiteeOverlay = (candidateIds: string[], body: SetDispositionBody) => {
    if (body.disposition === 'hold') return; // Caliper-only; no Recruitee state change
    const list = run?.candidates ?? [];
    const updates = new Map<string, {
      disqualified: boolean;
      stageId: string | null;
      stageName: string | null;
      disqualifyReason: string | null;
    }>();
    for (const cand of list) {
      if (!candidateIds.includes(cand.id)) continue;
      const applicantId = cand.recruitee_applicant_id ?? cand.recruiteeApplicantId ?? null;
      if (!applicantId) continue;
      const prior = recruiteeStateById.get(String(applicantId)) ?? null;
      if (body.disposition === 'reject') {
        updates.set(String(applicantId), {
          disqualified: true,
          stageId: prior?.stageId ?? null,
          stageName: prior?.stageName ?? null,
          disqualifyReason: prior?.disqualifyReason ?? null,
        });
      } else if (body.target_stage_id) {
        const requalifying = Boolean(body.requalify);
        updates.set(String(applicantId), {
          disqualified: requalifying ? false : (prior?.disqualified ?? false),
          stageId: String(body.target_stage_id),
          stageName: body.target_stage_name ?? null,
          disqualifyReason: requalifying ? null : (prior?.disqualifyReason ?? null),
        });
      }
    }
    if (updates.size === 0) return;
    setRecruiteeStateById((prev) => {
      const next = new Map(prev);
      for (const [key, value] of updates) next.set(key, value);
      return next;
    });
    invalidateApplicants(jobSourceRef);
  };

  const applyDisposition = async (
    candidateIds: string[],
    body: SetDispositionBody,
    pushToRecruitee = false,
  ) => {
    if (!runId || candidateIds.length === 0) return;
    setDispositionBusy(true);
    setDispositionError(null);
    setDispositionSuccess(null);
    try {
      const payload = { ...body, push_to_recruitee: pushToRecruitee };
      if (candidateIds.length === 1) {
        const res = await api.runs.setDisposition(runId, candidateIds[0], payload);
        updateCandidateInRun(res.candidate, run?.score_range ?? null);
        const baseLabel = dispositionSuccessLabel(body, res.candidate.name, jobSource === 'recruitee');
        if (pushToRecruitee && res.sync_status === 'failed') {
          setDispositionError(
            `Saved in Caliper, but Recruitee sync failed: ${res.sync_error ?? 'unknown error'}`,
          );
        } else if (pushToRecruitee && res.sync_status === 'synced') {
          applyLiveRecruiteeOverlay(candidateIds, body);
          setDispositionSuccess(`${baseLabel} Pushed to Recruitee.`);
        } else {
          setDispositionSuccess(baseLabel);
        }
      } else {
        const res = await api.runs.bulkDisposition(runId, {
          ...payload,
          candidate_ids: candidateIds,
        });
        setRun((prev) => {
          if (!prev) return prev;
          const byId = new Map(res.candidates.map((c) => [c.id, c]));
          return {
            ...prev,
            candidates: (prev.candidates ?? []).map((c) =>
              byId.has(c.id) ? { ...c, ...byId.get(c.id) } : c
            ),
          };
        });
        const failedSync = pushToRecruitee
          ? res.candidates.filter((c) => c.recruitee_sync_status === 'failed')
          : [];
        const movedLabel = body.requalify && body.target_stage_name
          ? `Re-qualified ${res.updated_count} candidate${res.updated_count === 1 ? '' : 's'} to ${body.target_stage_name}`
          : body.target_stage_name
            ? `Moved ${res.updated_count} candidate${res.updated_count === 1 ? '' : 's'} to ${body.target_stage_name}`
            : `Marked ${res.updated_count} candidate${res.updated_count === 1 ? '' : 's'} as ${DISPOSITION_LABELS[body.disposition] ?? body.disposition}`;
        if (res.errors?.length) {
          setDispositionError(
            `Updated ${res.updated_count} of ${candidateIds.length}. ${res.errors[0]?.error ?? 'Some updates failed.'}`,
          );
        } else if (failedSync.length) {
          setDispositionError(
            `${movedLabel} in Caliper, but ${failedSync.length} failed to sync to Recruitee: ${failedSync[0]?.recruitee_sync_error ?? 'unknown error'}`,
          );
        } else {
          if (pushToRecruitee) {
            const syncedIds = res.candidates
              .filter((c) => c.recruitee_sync_status === 'synced')
              .map((c) => c.id);
            applyLiveRecruiteeOverlay(syncedIds.length ? syncedIds : candidateIds, body);
          }
          setDispositionSuccess(
            `${movedLabel}${pushToRecruitee ? ' and pushed to Recruitee' : ''}.`,
          );
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not save pipeline decision';
      setDispositionError(message);
    } finally {
      setDispositionBusy(false);
      setPushModal(null);
    }
  };

  const guardDispositionSelection = (
    candidateIds: string[],
    disposition: CandidateDisposition,
    options?: { targetStageId?: string; targetStageName?: string; push?: boolean; requalify?: boolean },
  ) => {
    if (candidateIds.length === 0) {
      const hint = useRecruiteePipeline
        ? 'Select at least one candidate using the checkboxes, or use the pipeline menu in the Decision column.'
        : 'Select at least one candidate using the checkboxes in the table, or use the links in the Decision column.';
      setDispositionError(hint);
      setDispositionSuccess(null);
      return;
    }
    requestDisposition(candidateIds, disposition, options);
  };

  const moveToStage = (
    candidateIds: string[],
    stage: RecruiteePipelineStage,
    push?: boolean,
  ) => {
    const list = run?.candidates ?? [];
    const requalify = selectionNeedsRequalify(candidateIds, list, recruiteeStateById);
    guardDispositionSelection(candidateIds, 'advanced', {
      targetStageId: stage.id,
      targetStageName: stage.name,
      push: push ?? useRecruiteePipeline,
      requalify,
    });
  };

  const requestDisposition = (
    candidateIds: string[],
    disposition: CandidateDisposition,
    options?: { targetStageId?: string; targetStageName?: string; push?: boolean; requalify?: boolean },
  ) => {
    const body: SetDispositionBody = {
      disposition,
      ...(options?.targetStageId ? { target_stage_id: options.targetStageId } : {}),
      ...(options?.targetStageName ? { target_stage_name: options.targetStageName } : {}),
      ...(options?.requalify ? { requalify: true } : {}),
    };
    const recruiteeLinked = isRecruiteeJob
      && candidates.some(
        (c) => candidateIds.includes(c.id) && c.recruitee_applicant_id,
      );
    // Pipeline-mode actions (stage move / disqualify) push by default; hold never syncs.
    const wantsPush = options?.push ?? useRecruiteePipeline;

    if (wantsPush && recruiteeLinked && disposition !== 'hold') {
      setPushModal({
        disposition,
        candidateIds,
        targetStageId: options?.targetStageId,
        targetStageName: options?.targetStageName,
        requalify: options?.requalify,
      });
      return;
    }

    void applyDisposition(candidateIds, body, false);
  };

  const confirmPushModal = () => {
    if (!pushModal) return;
    void applyDisposition(
      pushModal.candidateIds,
      {
        disposition: pushModal.disposition,
        ...(pushModal.targetStageId ? { target_stage_id: pushModal.targetStageId } : {}),
        ...(pushModal.targetStageName ? { target_stage_name: pushModal.targetStageName } : {}),
        ...(pushModal.requalify ? { requalify: true } : {}),
      },
      true,
    );
  };

  if (!runId) return null;
  if (loading) {
    return (
      <div className="page">
        <div className="card">
          <PageLoading title="Loading results" message="Fetching run and candidate data…" />
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="page">
        <div className="card">
          <PageError message={error} onRetry={() => window.location.reload()} />
        </div>
      </div>
    )
  }
  if (!run) return null;

  const candidates = run.candidates ?? [];

  const filteredRows = candidates
    .filter((c) => matchesTextQuery(candidateSearchQuery, [c.name, c.title, c.location]))
    .filter((c) => matchesStatusFilter(c, filterStatus))
    .filter((c) => matchesDispositionFilter(c, filterDisposition))
    .filter((c) => {
      if (recruiteeQual === 'all') return true;
      const state = recruiteeStateFor(c, recruiteeStateById);
      if (recruiteeQual === 'disqualified') return Boolean(state?.disqualified);
      return Boolean(state) && !state.disqualified;
    });
  const rows = sortCandidates(filteredRows, sortState, recruiteeStateById);

  const nStrong = candidates.filter((c) => c.status === 'strong').length;
  const nPromising = candidates.filter((c) => c.status === 'promising').length;
  const nReviewOrFlag = candidates.filter((c) => c.status === 'review' || c.status === 'flagged').length;
  const nShortlisted = candidates.filter((c) => c.disposition === 'shortlist').length;
  const nOnHold = candidates.filter((c) => c.disposition === 'hold').length;
  const nRejected = candidates.filter((c) => c.disposition === 'reject').length;
  const nUndecided = candidates.filter((c) => !c.disposition).length;
  const isRecruiteeJob = jobSource === 'recruitee' && Boolean(jobSourceRef);
  const hasRecruiteeCandidates = candidates.some((c) => c.recruitee_applicant_id);
  const useRecruiteePipeline = isRecruiteeJob && pipelineStages.length > 0;
  const recruiteeDisqualifiedCount = candidates.filter(
    (c) => candidateShowsDisqualified(c, recruiteeStateById, useRecruiteePipeline),
  ).length;
  const recruiteeQualifiedCount = candidates.filter((c) => {
    const state = recruiteeStateFor(c, recruiteeStateById);
    return Boolean(state) && !state.disqualified;
  }).length;
  const pipelineStageGroups = useRecruiteePipeline ? groupPipelineStages(pipelineStages) : [];
  const canPushRecruitee = isRecruiteeJob;
  const meanConfPct = candidates.length
    ? Math.round((candidates.reduce((s, c) => s + confOrder(c.confidence), 0) / candidates.length / 3) * 100)
    : 0;

  const bulkNeedsRequalify = selectionNeedsRequalify(compareSelection, candidates, recruiteeStateById);

  const toggleStatFilter = (status) => {
    setFilterStatus((prev) => (prev === status ? 'all' : status));
  };

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Rank', 'Name', 'Title', 'Location', 'Score', 'Confidence', 'Status'];
    const body = rows.map((c, i) => [i + 1, c.name, c.title, c.location, c.score, c.confidence, c.status].map(esc).join(','));
    const csv = [header.join(','), ...body].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${runId}-candidates.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page" style={{ maxWidth: 1320 }}>
      <div className="row" style={{ marginBottom: 16, justifyContent: 'flex-end', gap: 8 }}>
        <Btn variant="ghost" icon="chevron-left" size="sm" onClick={() => go && go('runs')}>All runs</Btn>
        <Btn variant="ghost" icon="download" size="sm" onClick={exportCsv} disabled={run.status === 'in_progress'}>Export CSV</Btn>
        <Btn variant="default" icon="copy" onClick={() => go && go('profiles', { job: jobId })}>Re-run</Btn>
      </div>

      <div style={{ marginBottom: 18 }}>
        <RunAccessControl
          run={run}
          currentUserName={displayName}
          currentUserEmail={user?.email}
          currentUserAvatar={avatarUrl}
          members={members}
          membersLoading={membersLoading}
          open={shareOpen}
          onOpen={openShareMenu}
          onClose={() => setShareOpen(false)}
          onToggleShare={toggleShare}
          variant="detail"
        />
      </div>

      {(run.status === 'in_progress' || run.status === 'queued') && (
        <div
          className="card"
          style={{
            marginBottom: 18, padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: 12,
            borderColor: 'color-mix(in srgb, var(--info) 35%, var(--line))',
            background: 'color-mix(in srgb, var(--info-soft, var(--accent-soft)) 55%, var(--surface))',
          }}
        >
          <Icon name="sparkle" size={18} style={{ color: 'var(--info)', flexShrink: 0 }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
              Screening in progress
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {candidates.length} of {run.cv_count ?? candidates.length} CV{candidates.length === 1 ? '' : 's'} scored so far — results update automatically.
            </div>
          </div>
        </div>
      )}

      {run.status === 'failed' && run.error_message && (
        <div
          className="card"
          style={{
            marginBottom: 18, padding: '14px 18px',
            borderColor: 'color-mix(in srgb, var(--bad) 35%, var(--line))',
            background: 'var(--bad-soft)',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--bad-ink)' }}>Run failed</div>
          <div style={{ fontSize: 12, marginTop: 4, color: 'var(--bad-ink)' }}>{run.error_message}</div>
        </div>
      )}

      {run.run_note && (
        <div className="card" style={{ marginBottom: 18, padding: '14px 18px' }}>
          <div className="mono muted" style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
            Run note
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{run.run_note}</div>
        </div>
      )}

      <div className="stats stats--4" style={{ marginBottom: 22 }}>
        <StatCell
          label="Strong matches"
          value={String(nStrong)}
          sub="≥ 85"
          tone="ok"
          clickable={nStrong > 0}
          active={filterStatus === 'strong'}
          onClick={() => toggleStatFilter('strong')}
        />
        <StatCell
          label="Promising"
          value={String(nPromising)}
          sub="65 – 84"
          tone="info"
          clickable={nPromising > 0}
          active={filterStatus === 'promising'}
          onClick={() => toggleStatFilter('promising')}
        />
        <StatCell
          label="Review / flagged"
          value={String(nReviewOrFlag)}
          sub="parse warnings / flags"
          tone="warn"
          clickable={nReviewOrFlag > 0}
          active={filterStatus === 'review_flagged'}
          onClick={() => toggleStatFilter('review_flagged')}
        />
        <StatCell label="Mean confidence" value={`${meanConfPct}%`} sub="across all criteria" tone="default"/>
      </div>

      <div className="row" style={{ marginBottom: 16, borderBottom: '1px solid var(--line)', gap: 8, alignItems: 'center', paddingBottom: 6, flexWrap: 'wrap' }}>
        <span className="mono muted" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Ranked list</span>
        <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 280, minWidth: 160 }}>
          <input
            className="inp"
            placeholder="Search candidates…"
            style={{ paddingLeft: 32, height: 30, fontSize: 12 }}
            value={candidateSearchQuery}
            onChange={(e) => setCandidateSearchQuery(e.target.value)}
            aria-label="Search candidates"
          />
          <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: 8, color: 'var(--muted)' }}/>
        </div>
        <div className="spacer"/>
        <div className="row" style={{ gap: 8 }}>
          <span className="mono muted" style={{ fontSize: 11 }}>Status</span>
          <select className="sel" style={{ height: 30, padding: '0 10px', fontSize: 12 }}
                  value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="strong">Strong match</option>
            <option value="promising">Promising</option>
            <option value="review_flagged">Review / flagged</option>
            <option value="review">Review manually</option>
            <option value="flagged">Flagged</option>
          </select>
          <span className="mono muted" style={{ fontSize: 11, marginLeft: 8 }}>
            {useRecruiteePipeline ? 'Pipeline' : 'Decision'}
          </span>
          <select className="sel" style={{ height: 30, padding: '0 10px', fontSize: 12, maxWidth: 200 }}
                  value={filterDisposition} onChange={(e) => setFilterDisposition(e.target.value)}>
            <option value="all">All</option>
            <option value="undecided">Undecided</option>
            {useRecruiteePipeline ? (
              <>
                {pipelineStageGroups.map((group) => (
                  <optgroup key={group.category} label={group.label}>
                    {group.stages.map((stage) => (
                      <option key={stage.id} value={`stage:${stage.id}`}>
                        {stage.name} ({countCandidatesByStage(candidates, stage.id)})
                      </option>
                    ))}
                  </optgroup>
                ))}
                <option value="reject">Disqualified ({nRejected})</option>
                <option value="hold">On hold · Caliper ({nOnHold})</option>
              </>
            ) : (
              <>
                <option value="shortlist">Shortlisted</option>
                <option value="hold">On hold</option>
                <option value="reject">Rejected</option>
                <option value="advanced">Advanced</option>
              </>
            )}
          </select>
          {isRecruiteeJob && (
            <>
              <span className="mono muted" style={{ fontSize: 11, marginLeft: 8 }}>Recruitee</span>
              <select className="sel" style={{ height: 30, padding: '0 10px', fontSize: 12 }}
                      value={recruiteeQual} onChange={(e) => setRecruiteeQual(e.target.value as typeof recruiteeQual)}>
                <option value="all">All</option>
                <option value="qualified">Qualified ({recruiteeQualifiedCount})</option>
                <option value="disqualified">Disqualified ({recruiteeDisqualifiedCount})</option>
              </select>
            </>
          )}
        </div>
      </div>

      {run.status !== 'in_progress' && (
        <div className="pipeline-decisions-panel card">
          {isRecruiteeJob && !useRecruiteePipeline && (
            <div className="pipeline-decisions-panel__alert">
              <div className="pipeline-decisions-panel__alert-text">
                {pipelineStagesLoading
                  ? 'Loading this job\'s Recruitee pipeline stages…'
                  : pipelineStagesError
                    ?? 'Recruitee pipeline stages could not be loaded for this job.'}
              </div>
              {!pipelineStagesLoading && jobId && (
                <Btn
                  size="sm"
                  variant="ghost"
                  onClick={() => loadPipelineStages(jobId, jobSource, jobSourceRef)}
                >
                  Retry
                </Btn>
              )}
            </div>
          )}
          {!isRecruiteeJob && hasRecruiteeCandidates && (
            <div className="pipeline-decisions-panel__alert pipeline-decisions-panel__alert--info">
              These candidates came from Recruitee, but this job is not linked to a Recruitee role.
              Sync or import the job from Recruitee in <strong>Jobs</strong> to use its real pipeline stages here.
            </div>
          )}

          <div className="pipeline-decisions-panel__header">
            <div className="pipeline-decisions-panel__intro">
              <span className="pipeline-decisions-panel__label">
                {useRecruiteePipeline ? 'Recruitee pipeline' : 'Pipeline decisions'}
              </span>
              {useRecruiteePipeline && isRecruiteeJob && (
                <span className="pipeline-decisions-panel__counts">
                  {recruiteeQualifiedCount} qualified · {recruiteeDisqualifiedCount} disqualified
                </span>
              )}
              <p className="pipeline-decisions-panel__hint">
                {canEdit
                  ? useRecruiteePipeline
                    ? compareSelection.length > 0
                      ? bulkNeedsRequalify
                        ? 'Selected candidates are disqualified — pick a stage to re-qualify them in Recruitee.'
                        : `Move ${compareSelection.length} selected candidate${compareSelection.length === 1 ? '' : 's'} to a stage.`
                      : 'Use Move to… per row, or select rows for bulk stage moves. Disqualified candidates can be re-qualified via Re-qualify to….'
                    : 'Record who you shortlisted, held, or rejected after AI review.'
                  : useRecruiteePipeline
                    ? 'Pipeline status reflects each candidate\'s live Recruitee state.'
                    : 'Editors can set pipeline decisions on this run.'}
              </p>
            </div>
          </div>

          {canEdit && compareSelection.length > 0 && (
            <div className="pipeline-decisions-panel__bulk">
              <span className="pipeline-decisions-panel__bulk-label">
                {bulkNeedsRequalify ? 'Re-qualify selected to' : 'Move selected to'}
              </span>
              {useRecruiteePipeline ? (
                <PipelineStageActions
                  stages={pipelineStages}
                  disabled={dispositionBusy}
                  onStage={(stage) => moveToStage(compareSelection, stage)}
                  onHold={() => guardDispositionSelection(compareSelection, 'hold')}
                  onDisqualify={() => guardDispositionSelection(compareSelection, 'reject')}
                />
              ) : (
                <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Btn size="sm" variant="ghost" disabled={dispositionBusy}
                       onClick={() => guardDispositionSelection(compareSelection, 'shortlist')}>Shortlist</Btn>
                  <Btn size="sm" variant="ghost" disabled={dispositionBusy}
                       onClick={() => guardDispositionSelection(compareSelection, 'hold')}>Hold</Btn>
                  <Btn size="sm" variant="ghost" disabled={dispositionBusy}
                       onClick={() => guardDispositionSelection(compareSelection, 'reject')}>Reject</Btn>
                  {canPushRecruitee && (
                    <Btn size="sm" variant="default" disabled={dispositionBusy}
                         onClick={() => guardDispositionSelection(compareSelection, 'shortlist', { push: true })}>
                      Shortlist + push
                    </Btn>
                  )}
                </div>
              )}
            </div>
          )}

          {(dispositionError || dispositionSuccess) && (
            <div className={`pipeline-decisions-panel__feedback${dispositionError ? ' pipeline-decisions-panel__feedback--error' : ''}`}>
              {dispositionError ?? dispositionSuccess}
            </div>
          )}
        </div>
      )}

      <div className="row" style={{ marginBottom: 10, gap: 8, alignItems: 'center' }}>
        <span className="muted" style={{ fontSize: 12 }}>
          {compareSelection.length === 0
            ? useRecruiteePipeline
              ? 'Check rows for bulk pipeline moves, or use Move to… in the Pipeline column'
              : 'Check rows for bulk actions, or use Shortlist/Hold/Reject in the Decision column'
            : `${compareSelection.length} selected${compareSelection.length >= MAX_COMPARE ? ' (max)' : ''}`}
        </span>
        <div className="spacer"/>
        <Btn
          variant="default"
          size="sm"
          icon="columns"
          disabled={compareSelection.length < 2 || run.status === 'in_progress'}
          onClick={openCompare}
        >
          Compare{compareSelection.length >= 2 ? ` (${compareSelection.length})` : ''}
        </Btn>
      </div>

      <RankedList
        rows={rows}
        emptyMessage={
          candidates.length === 0
            ? 'No candidates yet.'
            : candidateSearchQuery.trim()
              ? `No candidates match “${candidateSearchQuery.trim()}”.`
              : 'No candidates match the current filters.'
        }
        onOpen={setSelected}
        tweaks={tweaks}
        compareSelection={compareSelection}
        maxCompare={MAX_COMPARE}
        onToggleCompare={toggleCompareSelect}
        canEdit={canEdit && run.status !== 'in_progress'}
        onDisposition={requestDisposition}
        onMoveToStage={moveToStage}
        useRecruiteePipeline={useRecruiteePipeline}
        pipelineStages={pipelineStages}
        canPushRecruitee={canPushRecruitee}
        dispositionBusy={dispositionBusy}
        recruiteeStateById={recruiteeStateById}
        sortState={sortState}
        onSort={(key) => setSortState((prev) => cycleTableSort(prev, key) ?? { key, dir: 'desc' })}
      />

      <PushRecruiteeModal
        open={Boolean(pushModal)}
        platformActor={platformActor}
        userName={displayName ?? user?.email ?? 'You'}
        dispositionLabel={
          pushModal
            ? (pushModal.requalify && pushModal.targetStageName
              ? `Re-qualify to ${pushModal.targetStageName}`
              : pushModal.targetStageName
                ?? (pushModal.disposition === 'reject' && useRecruiteePipeline
                  ? 'Disqualify'
                  : DISPOSITION_LABELS[pushModal.disposition]))
            : ''
        }
        candidateCount={pushModal?.candidateIds.length ?? 1}
        loading={dispositionBusy}
        onCancel={() => setPushModal(null)}
        onConfirm={confirmPushModal}
      />

      <CandidateCompareSheet
        open={compareOpen}
        loading={compareLoading}
        error={compareError}
        data={compareData}
        onClose={() => setCompareOpen(false)}
        onOpenCandidate={openCandidateFromCompare}
        tweaks={tweaks}
      />

      {selected && (
        <CandidateDetail
          candidateId={selected}
          runId={run.id}
          allCandidates={candidates}
          onClose={() => setSelected(null)}
          onCandidateChange={setSelected}
          onCandidateUpdated={updateCandidateInRun}
          canEdit={canEdit}
          onDisposition={requestDisposition}
          onMoveToStage={moveToStage}
          useRecruiteePipeline={useRecruiteePipeline}
          pipelineStages={pipelineStages}
          canPushRecruitee={canPushRecruitee}
          recruiteeState={recruiteeStateFor({ recruitee_applicant_id: candidates.find((c) => c.id === selected)?.recruitee_applicant_id }, recruiteeStateById)}
          onPushRecruitee={(candidateId) => {
            void api.runs.pushRecruitee(run.id, candidateId).then((res) => {
              updateCandidateInRun(res.candidate, run.score_range ?? null);
              if (res.candidate?.recruitee_sync_status !== 'failed' && res.candidate?.disposition) {
                applyLiveRecruiteeOverlay([candidateId], {
                  disposition: res.candidate.disposition,
                  target_stage_id: res.candidate.target_stage_id,
                  target_stage_name: res.candidate.target_stage_name,
                });
              }
            });
          }}
          dispositionBusy={dispositionBusy}
          tweaks={tweaks}
          go={go}
        />
      )}
    </div>
  );
}

const StatCell = ({ label, value, sub, tone, clickable, active, onClick }) => {
  const className = [
    'stats__cell',
    clickable ? 'stats__cell--clickable' : '',
    active ? 'stats__cell--active' : '',
  ].filter(Boolean).join(' ');

  const content = (
    <>
      <div className="stats__lbl">{label}</div>
      <div className="stats__val" style={{
        color: tone === 'ok' ? 'var(--ok-ink)' : tone === 'warn' ? 'var(--warn-ink)' : tone === 'info' ? 'oklch(0.42 0.10 245)' : undefined,
      }}>{value}</div>
      {sub && <div className="stats__delta">· {sub}</div>}
    </>
  );

  if (!clickable) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      aria-pressed={active}
      title={active ? 'Show all candidates' : `Show only ${label.toLowerCase()}`}
    >
      {content}
    </button>
  );
};

function RankedList({
  rows,
  emptyMessage = 'No candidates yet.',
  onOpen,
  tweaks,
  compareSelection = [],
  maxCompare = 4,
  onToggleCompare,
  canEdit = false,
  onDisposition,
  onMoveToStage,
  useRecruiteePipeline = false,
  pipelineStages = [],
  canPushRecruitee = false,
  dispositionBusy = false,
  recruiteeStateById,
  sortState,
  onSort,
}) {
  if (rows.length === 0) {
    return <div className="card"><div className="muted" style={{ textAlign: 'center', padding: 32 }}>{emptyMessage}</div></div>;
  }
  const atMax = compareSelection.length >= maxCompare;
  return (
    <div className="card">
      <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th className="compare-select-cell" style={{ width: 36 }} aria-label="Compare selection"/>
            <th style={{ width: 36 }}/>
            <ResultsSortableTh label="Rank" sortKey="rank" sortState={sortState} onSort={onSort} style={{ width: 56 }}/>
            <ResultsSortableTh label="Candidate" sortKey="candidate" sortState={sortState} onSort={onSort}/>
            <ResultsSortableTh label="% met" sortKey="pct_met" sortState={sortState} onSort={onSort} style={{ width: 88 }} className="col-num"/>
            <ResultsSortableTh label="Score" sortKey="score" sortState={sortState} onSort={onSort} style={{ width: 200 }}/>
            <ResultsSortableTh label="Confidence" sortKey="confidence" sortState={sortState} onSort={onSort} style={{ width: 100 }} className="tbl-col-hide-sm"/>
            <ResultsSortableTh label="Status" sortKey="status" sortState={sortState} onSort={onSort} style={{ width: 160 }} className="tbl-col-hide-sm"/>
            <ResultsSortableTh
              label={useRecruiteePipeline ? 'Pipeline' : 'Decision'}
              sortKey="pipeline"
              sortState={sortState}
              onSort={onSort}
              style={{ width: 160 }}
              className="tbl-col-hide-sm"
            />
            <th style={{ width: 36 }}/>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => {
            const m = candidateMetrics(c);
            const isCompareSelected = compareSelection.includes(c.id);
            const compareDisabled = !isCompareSelected && atMax;
            const rState = recruiteeStateFor(c, recruiteeStateById);
            const isDisqualified = candidateShowsDisqualified(c, recruiteeStateById, useRecruiteePipeline);
            return (
            <tr
              key={c.id}
              onClick={() => onOpen(c.id)}
              className={`is-clickable${isCompareSelected ? ' is-compare-selected' : ''}`}
            >
              <td className="compare-select-cell" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={isCompareSelected}
                  disabled={compareDisabled}
                  aria-label={`Select ${c.name ?? 'candidate'} for comparison`}
                  title={compareDisabled ? `Maximum ${maxCompare} candidates` : undefined}
                  onChange={() => onToggleCompare?.(c.id)}
                />
              </td>
              <td>
                <span style={{
                  display: 'inline-grid', placeItems: 'center',
                  width: 26, height: 26, borderRadius: '50%',
                  background: 'var(--bg-sunk)', color: 'var(--ink-soft)',
                  fontSize: 11, fontWeight: 600,
                }}>{(c.name ?? '??').split(' ').map((n) => n[0]).slice(0, 2).join('')}</span>
              </td>
              <td className="col-num muted" style={{ fontSize: 12 }}>#{String(i + 1).padStart(2, '0')}</td>
              <td>
                <div style={{ fontWeight: 500, fontSize: 13.5 }}>{c.name ?? '—'}</div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>{c.title} · {c.location}</div>
                {c.parse_warning && (
                  <div style={{ fontSize: 11, color: 'var(--warn-ink)', marginTop: 3 }}>
                    <Icon name="alert" size={10}/> {c.parse_warning}
                  </div>
                )}
              </td>
              <td className="mono" style={{ fontSize: 12 }}>
                {m.criteriaMetPct != null ? `${m.criteriaMetPct}%` : '—'}
              </td>
              <td>
                <ScoreBar score={c.score ?? 0} must={m.mustMet} nice={m.niceMet} flag={m.flagTriggered} variant={tweaks?.scoreStyle}/>
                <div className="muted mono" style={{ fontSize: 10.5, marginTop: 4 }}>
                  {m.mustMet} must · {m.niceMet} nice · {m.flagTriggered} flag
                </div>
              </td>
              <td className="tbl-col-hide-sm"><Confidence level={c.confidence}/></td>
              <td className="tbl-col-hide-sm"><StatusBadge s={c.status}/></td>
              <td className="tbl-col-hide-sm" onClick={(e) => e.stopPropagation()}>
                <div className="decision-cell">
                  {rState ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <RecruiteeStatusBadge state={rState} compact />
                      {c.disposition && c.recruitee_sync_status === 'failed' && (
                        <span className="disposition-badge-wrap__sync-failed" title="Last Caliper push to Recruitee failed">!</span>
                      )}
                    </span>
                  ) : isDisqualified ? (
                    <Badge tone="bad" dot>Disqualified</Badge>
                  ) : (
                    <DispositionBadge
                      disposition={c.disposition}
                      targetStageName={c.target_stage_name}
                      syncStatus={c.recruitee_sync_status}
                      compact
                      recruiteePipeline={useRecruiteePipeline}
                    />
                  )}
                  {!c.disposition && !rState && !isDisqualified && (
                    <span className="muted" style={{ fontSize: 11 }}>Undecided</span>
                  )}
                  {canEdit && (
                    useRecruiteePipeline && pipelineStages.length > 0 ? (
                      <PipelineStageActions
                        compact
                        stages={pipelineStages}
                        disabled={dispositionBusy}
                        onStage={(stage) => onMoveToStage?.([c.id], stage)}
                        onDisqualify={isDisqualified ? undefined : () => onDisposition?.([c.id], 'reject')}
                        showHold={false}
                        showDisqualify={!isDisqualified}
                        moveLabel={isDisqualified ? 'Re-qualify to…' : 'Move to…'}
                      />
                    ) : (
                      <div className="decision-cell__actions">
                        <button type="button" disabled={dispositionBusy}
                                onClick={() => onDisposition?.([c.id], 'shortlist')}>Shortlist</button>
                        <button type="button" disabled={dispositionBusy}
                                onClick={() => onDisposition?.([c.id], 'hold')}>Hold</button>
                        <button type="button" disabled={dispositionBusy}
                                onClick={() => onDisposition?.([c.id], 'reject')}>Reject</button>
                      </div>
                    )
                  )}
                </div>
              </td>
              <td><Icon name="chevron-right" size={14} className="muted"/></td>
            </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function CandidateDetail({
  candidateId,
  runId,
  allCandidates,
  onClose,
  onCandidateChange,
  onCandidateUpdated,
  tweaks,
  go,
  canEdit = false,
  onDisposition,
  onMoveToStage,
  useRecruiteePipeline = false,
  pipelineStages = [],
  canPushRecruitee = false,
  recruiteeState = null,
  onPushRecruitee,
  dispositionBusy = false,
}) {
  const [evalData, setEvalData] = React.useState<CandidateEvaluationResponse | null>(null);
  const [evalLoading, setEvalLoading] = React.useState(true);
  const [decisions, setDecisions] = React.useState<Record<string, 'agree' | 'override' | null>>({});
  const [overrideModal, setOverrideModal] = React.useState<{ evalId: string; currentMet: boolean | null } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [cvLink, setCvLink] = React.useState(null);

  React.useEffect(() => {
    setEvalLoading(true);
    setCvLink(null);
    api.candidates.getEvaluation(candidateId)
      .then((data) => {
        setEvalData(data);
        const initial: Record<string, 'agree' | 'override' | null> = {};
        for (const e of data.evaluations ?? []) {
          if (e.overridden_by) initial[e.id] = 'override';
          else if (e.agreed_by) initial[e.id] = 'agree';
        }
        setDecisions(initial);
      })
      .catch(() => setEvalData(null))
      .finally(() => setEvalLoading(false));
  }, [candidateId]);

  const candidate = evalData?.candidate ?? allCandidates.find((c) => c.id === candidateId);

  // Group evaluations by criterion kind
  const sections = React.useMemo(() => {
    const evals = evalData?.evaluations ?? [];
    const grouped: Record<'must' | 'nice' | 'flag', EvaluationItem[]> = { must: [], nice: [], flag: [] };
    evals.forEach((e) => {
      const kind = e.job_criteria?.kind ?? 'must';
      if (grouped[kind]) grouped[kind].push(e);
    });
    return [
      { kind: 'must', label: 'Must-have criteria',  items: grouped.must },
      { kind: 'nice', label: 'Nice-to-have',         items: grouped.nice },
      { kind: 'flag', label: 'Red flags',            items: grouped.flag },
    ].filter((s) => s.items.length > 0);
  }, [evalData]);

  const handleOverride = async (evalId: string, met: boolean, note: string) => {
    setSaving(true);
    try {
      const result = await api.candidates.override(evalId, met, note);
      setEvalData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          candidate: result.candidate ?? prev.candidate,
          evaluations: prev.evaluations.map((e) =>
            e.id === evalId
              ? { ...e, met, override_note: note, overridden_by: 'you', agreed_by: null, agreed_at: null }
              : e
          ),
        };
      });
      if (result.candidate) {
        onCandidateUpdated?.(result.candidate, result.score_range);
      }
      setDecisions((d) => ({ ...d, [evalId]: 'override' }));
    } finally {
      setSaving(false);
      setOverrideModal(null);
    }
  };

  const handleAgree = async (evalId: string) => {
    setSaving(true);
    try {
      await api.candidates.agree(evalId);
      setEvalData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          evaluations: prev.evaluations.map((e) =>
            e.id === evalId ? { ...e, agreed_by: 'you', agreed_at: new Date().toISOString() } : e
          ),
        };
      });
      setDecisions((d) => ({ ...d, [evalId]: 'agree' }));
    } finally {
      setSaving(false);
    }
  };

  if (!candidate) return null;

  const detailMetrics = candidateMetrics(candidate);

  return (
    <div className="detail" onClick={onClose}>
      <div className="detail__panel" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="detail__head">
            <span style={{
              display: 'inline-grid', placeItems: 'center',
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--bg-sunk)', color: 'var(--ink)',
              fontSize: 12, fontWeight: 600,
            }}>{(candidate.name ?? '??').split(' ').map((n) => n[0]).slice(0, 2).join('')}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 500, letterSpacing: '-0.005em' }}>{candidate.name ?? '—'}</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>
                {candidate.title} · {candidate.location} · <span className="mono">{runId}</span>
              </div>
            </div>
            <div className="col" style={{ gap: 4, alignItems: 'flex-end' }}>
              <ScoreBar score={candidate.score ?? 0} must={detailMetrics.mustMet} nice={detailMetrics.niceMet} flag={detailMetrics.flagTriggered} variant={tweaks?.scoreStyle}/>
              <ScoreDeductionBreakdown candidate={candidate}/>
            </div>
            <StatusBadge s={candidate.status}/>
            {recruiteeState ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <RecruiteeStatusBadge state={recruiteeState} />
                {candidate.disposition && candidate.recruitee_sync_status === 'failed' && (
                  <span className="disposition-badge-wrap__sync-failed" title="Last Caliper push to Recruitee failed">!</span>
                )}
              </span>
            ) : (
              <DispositionBadge
                disposition={candidate.disposition}
                targetStageName={candidate.target_stage_name}
                syncStatus={candidate.recruitee_sync_status}
                recruiteePipeline={useRecruiteePipeline}
              />
            )}
            <Confidence level={candidate.confidence}/>
            <IconBtn name="x" size={16} onClick={onClose}/>
          </div>

          {allCandidates.length > 1 && (
            <div style={{ padding: '10px 22px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)' }}>
              <select className="sel" style={{ width: 'min(360px, 100%)', height: 32, fontSize: 12.5 }}
                      value={candidateId} onChange={(e) => onCandidateChange(e.target.value)}>
                {allCandidates.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {c.score ?? '?'}</option>
                ))}
              </select>
              <span className="muted" style={{ fontSize: 11.5 }}>Switch without closing.</span>
            </div>
          )}

          <CandidateHistoryPanel
            candidateId={candidateId}
            onNavigate={(targetRunId) => {
              onClose();
              if (typeof go === 'function') go('results', targetRunId);
            }}
          />

          {canEdit && !useRecruiteePipeline && (
            <div className="disposition-actions" style={{ padding: '12px 22px', borderBottom: '1px solid var(--line)' }}>
              <div className="col" style={{ gap: 10 }}>
                <span className="mono muted" style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Pipeline decision
                </span>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Btn size="sm" variant="ghost" disabled={dispositionBusy}
                       onClick={() => onDisposition?.([candidateId], 'shortlist')}>Shortlist</Btn>
                  <Btn size="sm" variant="ghost" disabled={dispositionBusy}
                       onClick={() => onDisposition?.([candidateId], 'hold')}>Hold</Btn>
                  <Btn size="sm" variant="ghost" disabled={dispositionBusy}
                       onClick={() => onDisposition?.([candidateId], 'reject')}>Reject</Btn>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {evalLoading ? (
            <div className="muted" style={{ padding: 32 }}>Loading evaluation…</div>
          ) : (
            <div className="detail__body">
              <div className="detail__cv">
                <CvViewer
                  candidateId={candidateId}
                  candidateName={candidate.name}
                  highlightQuote={cvLink?.quote}
                  highlightKind={cvLink?.kind}
                  highlightLabel={cvLink?.label}
                />
              </div>
              <div className="detail__eval">
                {(candidate.summary || detailMetrics.criteriaMetPct != null) && (
                  <div style={{ padding: '14px 0 8px', borderBottom: '1px solid var(--line)', marginBottom: 12 }}>
                    {detailMetrics.criteriaMetPct != null && (
                      <div style={{ marginBottom: candidate.summary ? 10 : 0 }}>
                        <ChecklistSummary counts={countsFromCandidateRow(candidate)}/>
                        <div style={{ marginTop: 8 }}>
                          <ScoreDeductionBreakdown candidate={candidate}/>
                        </div>
                      </div>
                    )}
                    {candidate.summary && (
                      <>
                        <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Summary</div>
                        <p style={{ fontSize: 13, lineHeight: 1.55 }}>{candidate.summary}</p>
                      </>
                    )}
                    {candidate.parse_warning && (
                      <div style={{ fontSize: 11.5, color: 'var(--warn-ink)', marginTop: 6 }}>
                        <Icon name="alert" size={11}/> {candidate.parse_warning}
                      </div>
                    )}
                  </div>
                )}

                <CvQuotesPanel
                  evaluations={evalData?.evaluations}
                  onQuoteHover={setCvLink}
                  activeQuote={cvLink?.quote}
                />

                <CriteriaChecklistPanel
                  evaluations={evalData?.evaluations}
                  candidate={candidate}
                  sections={sections}
                  decisions={decisions}
                  onAgree={(id) => { void handleAgree(id); }}
                  onOverride={(id, currentMet) => setOverrideModal({ evalId: id, currentMet })}
                  onQuoteHover={setCvLink}
                  activeQuote={cvLink?.quote}
                />

                <div className="row" style={{ marginTop: 14, padding: '14px 0', borderTop: '1px solid var(--line)', justifyContent: 'space-between' }}>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    <Icon name="history" size={11}/> Overrides are logged in the job audit trail.
                  </div>
                  <Btn
                    variant="ghost"
                    size="sm"
                    icon="download"
                    onClick={async () => {
                      try {
                        const url = await api.candidates.fetchCvBlobUrl(candidateId);
                        window.open(url, '_blank', 'noopener,noreferrer');
                      } catch {
                        /* CvViewer shows error */
                      }
                    }}
                  >
                    Download CV
                  </Btn>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {overrideModal && (
        <OverrideDialog
          currentMet={overrideModal.currentMet}
          onConfirm={(met, note) => handleOverride(overrideModal.evalId, met, note)}
          onCancel={() => setOverrideModal(null)}
          saving={saving}
        />
      )}
    </div>
  );
}

function EvalCriterion({ item, sectionKind, decision, onAgree, onOverride }) {
  const isOverridden = !!item.overridden_by;
  return (
    <div className={`crit${decision ? ' is-active' : ''}`}>
      <div className="crit__hd">
        <span style={{
          width: 18, height: 18, borderRadius: '50%',
          display: 'grid', placeItems: 'center', flex: 'none',
          background: item.met ? (sectionKind === 'flag' ? 'var(--bad-soft)' : 'var(--ok-soft)') : 'var(--bg-sunk)',
          color: item.met ? (sectionKind === 'flag' ? 'var(--bad-ink)' : 'var(--ok-ink)') : 'var(--muted)',
        }}>
          {item.met
            ? (sectionKind === 'flag' ? <Icon name="alert" size={10} stroke={2.4}/> : <Icon name="check" size={11} stroke={2.6}/>)
            : <Icon name="x" size={10} stroke={2.2}/>}
        </span>
        <span className="crit__name">{item.job_criteria?.name}</span>
        {item.job_criteria?.weight != null && (
          <span className="mono muted" style={{ fontSize: 10.5 }}>×{item.job_criteria.weight}</span>
        )}
        {sectionKind === 'flag' && item.met && item.job_criteria?.weight != null && (
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--bad-ink)' }}>
            −{item.inferred
              ? Math.round(item.job_criteria.weight * 2)
              : item.job_criteria.weight * 4} pts
          </span>
        )}
        <Confidence level={item.confidence}/>
        {isOverridden && <span style={{ fontSize: 10, color: 'var(--warn-ink)', background: 'var(--warn-soft)', padding: '1px 5px', borderRadius: 4 }}>overridden</span>}
      </div>

      {item.quote && (
        <div className="crit__quote">"{item.quote}"</div>
      )}
      {item.inferred && (
        <div className="crit__inferred"><Icon name="info" size={11}/> Inferred — not directly stated.</div>
      )}
      {item.notes && (
        <div className="muted" style={{ fontSize: 12, padding: '4px 0 8px' }}>{item.notes}</div>
      )}
      {item.override_note && (
        <div style={{ fontSize: 12, color: 'var(--warn-ink)', padding: '2px 0 8px' }}>
          Override note: {item.override_note}
        </div>
      )}

      <div className="crit__actions">
        <DecisionBtn label="Agree"    icon="check" active={decision === 'agree'}    tone="ok"      onClick={onAgree}/>
        <DecisionBtn label="Override" icon="edit"  active={decision === 'override'} tone="warn"    onClick={onOverride}/>
      </div>
    </div>
  );
}

function OverrideDialog({ currentMet, onConfirm, onCancel, saving }) {
  const [met, setMet] = React.useState(!currentMet); // flip by default
  const [note, setNote] = React.useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 100, display: 'grid', placeItems: 'center' }}
         onClick={onCancel}>
      <div style={{ background: 'var(--surface)', borderRadius: 10, padding: 24, width: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
           onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>Override criterion</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
            <input type="radio" checked={met === true} onChange={() => setMet(true)}/> Met
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
            <input type="radio" checked={met === false} onChange={() => setMet(false)}/> Not met
          </label>
        </div>
        <textarea
          style={{ width: '100%', height: 72, fontSize: 12.5, padding: 8, borderRadius: 6, border: '1px solid var(--line)', resize: 'vertical', boxSizing: 'border-box' }}
          placeholder="Override note (required)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end', gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={onCancel}>Cancel</Btn>
          <Btn variant="primary" size="sm" onClick={() => note.trim() && onConfirm(met, note.trim())} disabled={saving || !note.trim()}>
            {saving ? 'Saving…' : 'Confirm override'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

const DecisionBtn = ({ label, icon, active, tone, onClick }) => (
  <button type="button" onClick={onClick}
    className="inline-flex h-[26px] items-center justify-center gap-1.5 rounded-md border px-2.5 text-[11.5px] font-medium transition-colors"
    style={{
      background: active ? (tone === 'ok' ? 'var(--ok-soft)' : tone === 'warn' ? 'var(--warn-soft)' : 'var(--bg-sunk)') : 'var(--surface)',
      borderColor: active ? (tone === 'ok' ? 'oklch(0.78 0.10 150)' : 'oklch(0.80 0.12 70)') : 'var(--line)',
      color: active ? (tone === 'ok' ? 'var(--ok-ink)' : 'var(--warn-ink)') : 'var(--ink-soft)',
    }}>
    <Icon name={icon} size={11} stroke={2}/>{label}
  </button>
);

export default ResultsPage;
