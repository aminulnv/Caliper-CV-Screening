// @ts-nocheck
// Page — Run results for /runs/:runId
import React from 'react'
import { Icon, Btn, PageLoading, PageError, PageHeader, FilterChips } from '@/caliper/ui'
import { useSetPageTitle } from '@/caliper/PageTitleContext'
import { api } from '@/services/api'
import { CandidateCompareSheet } from '@/caliper/components/CandidateCompareSheet'
import { RunAccessControl } from '@/caliper/components/RunAccessControl'
import { PushRecruiteeModal } from '@/caliper/components/PushRecruiteeModal'
import { PipelineStageActions } from '@/caliper/components/PipelineStageActions'
import { useAuth } from '@/contexts/AuthContext'
import { memberUserId, parseSharedUserIds } from '@/lib/run-share'
import { groupPipelineStages } from '@/lib/recruitee-pipeline'
import { shapeJobRow } from '@/lib/job-profile'
import { getCachedApplicants, loadRecruiteeApplicants, invalidateApplicants } from '@/lib/applicants-cache'
import { AppToast, useToast } from '@/caliper/components/AppToast'
import { matchesTextQuery } from '@/lib/text-search'
import {
  MAX_COMPARE,
  confOrder,
  matchesStatusFilter,
  matchesDispositionFilter,
  recruiteeStateFor,
  selectionNeedsRequalify,
  candidateShowsDisqualified,
  sortCandidates,
  cycleTableSort,
  DISPOSITION_LABELS,
  dispositionSuccessLabel,
  patchCandidatesDisposition,
} from './results-utils'
import { RankedList } from './components/RankedList'
import { CandidateDetailSheet } from './components/CandidateDetailSheet'
import { ResultsStatsStrip } from './components/ResultsStatsStrip'
import { ResultsStatusBanners } from './components/ResultsStatusBanners'
import { ResultsFilterBar } from './components/ResultsFilterBar'
import { ScreeningLoadingScreen } from './components/ScreeningLoadingScreen'

function ResultsPage({ tweaks, route, go }) {
  const { displayName, avatarUrl, user, canEdit } = useAuth();
  const { toast, showToast, dismissToast } = useToast();
  const runId = route?.runId ?? route?.run;

  React.useEffect(() => {
    if (!runId && typeof go === 'function') go('runs');
  }, [runId, go]);

  const [run, setRun] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [selected, setSelected] = React.useState(null);
  const [compareSelection, setCompareSelection] = React.useState([]);
  const [compareOpen, setCompareOpen] = React.useState(false);
  const [compareLoading, setCompareLoading] = React.useState(false);
  const [compareError, setCompareError] = React.useState(null);
  const [compareData, setCompareData] = React.useState(null);
  const [sortState, setSortState] = React.useState({ key: 'score', dir: 'desc' });
  const [filterStatus, setFilterStatus] = React.useState('all');
  const [filterDisposition, setFilterDisposition] = React.useState('all');
  const [candidateSearchQuery, setCandidateSearchQuery] = React.useState('');
  const [pipelineStages, setPipelineStages] = React.useState([]);
  const [pipelineStagesLoading, setPipelineStagesLoading] = React.useState(false);
  const [pipelineStagesError, setPipelineStagesError] = React.useState(null);
  const [recruiteeStateById, setRecruiteeStateById] = React.useState(() => new Map());
  const [recruiteeQual, setRecruiteeQual] = React.useState('all');
  const [platformActor, setPlatformActor] = React.useState('platform integration account');
  const [jobSource, setJobSource] = React.useState(null);
  const [jobSourceRef, setJobSourceRef] = React.useState(null);
  const [dispositionBusy, setDispositionBusy] = React.useState(false);
  const [dispositionError, setDispositionError] = React.useState(null);
  const [dispositionSuccess, setDispositionSuccess] = React.useState(null);
  const [pushModal, setPushModal] = React.useState(null);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [members, setMembers] = React.useState(null);
  const [membersLoading, setMembersLoading] = React.useState(false);
  const [pollError, setPollError] = React.useState(null);
  const [jobMetaError, setJobMetaError] = React.useState(null);
  const [dispositionFlashIds, setDispositionFlashIds] = React.useState([]);

  React.useEffect(() => {
    if (!runId) return;
    setLoading(true);
    api.runs.get(runId)
      .then((data) => { setRun(data); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [runId]);

  React.useEffect(() => {
    if (!runId || !run || run.status !== 'in_progress') return;
    const interval = setInterval(() => {
      api.runs.get(runId)
        .then((data) => {
          setRun(data);
          setPollError(null);
          if (data.status !== 'in_progress') clearInterval(interval);
        })
        .catch((e) => {
          setPollError(e instanceof Error ? e.message : 'Could not refresh run status');
        });
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
    jobId,
    source,
    sourceRef,
  ) => {
    const recruiteeLinked = source === 'recruitee' && Boolean(sourceRef);
    setPipelineStagesLoading(true);
    setPipelineStagesError(null);

    const applyStages = (stages) => {
      setPipelineStages(stages);
      if (stages.length === 0 && recruiteeLinked) {
        setPipelineStagesError(
          'No pipeline stages returned from Recruitee for this job. Open the job in Jobs → Applicants to verify the connection.',
        );
      }
    };

    const tryApplicantsFallback = async () => {
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
  const jobName = run?.job_profiles?.name ?? null;

  useSetPageTitle(
    jobName ?? (runId ? `Run ${runId}` : null),
    runId ?? null,
  );

  React.useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    api.jobs.get(jobId)
      .then((job) => {
        if (cancelled) return;
        setJobMetaError(null);
        const shaped = shapeJobRow(job);
        setJobSource(shaped.source ?? null);
        setJobSourceRef(shaped.sourceRef ?? null);
        void loadPipelineStages(jobId, shaped.source ?? null, shaped.sourceRef ?? null);
      })
      .catch((e) => {
        if (cancelled) return;
        setJobMetaError(e instanceof Error ? e.message : 'Could not load job details');
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

  React.useEffect(() => {
    const linked = jobSource === 'recruitee' && Boolean(jobSourceRef);
    if (!linked || !jobSourceRef) {
      setRecruiteeStateById(new Map());
      return;
    }
    let cancelled = false;
    const sourceRef = jobSourceRef;

    const buildMap = (applicants) => {
      const map = new Map();
      for (const applicant of applicants ?? []) {
        if (applicant?.id == null) continue;
        map.set(String(applicant.id), {
          disqualified: Boolean(applicant.disqualified),
          stageId: applicant.stage_id ?? null,
          stageName: applicant.stage_name ?? null,
          disqualifyReason: applicant.disqualify_reason ?? null,
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
      showToast({ message: 'Could not update run sharing. Try again.', tone: 'bad' });
    });
  };

  const toggleCompareSelect = (id) => {
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

  const openCandidateFromCompare = (candidateId) => {
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

  const applyLiveRecruiteeOverlay = (candidateIds, body) => {
    if (body.disposition === 'hold') return;
    const list = run?.candidates ?? [];
    const updates = new Map();
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
    candidateIds,
    body,
    pushToRecruitee = false,
  ) => {
    if (!runId || candidateIds.length === 0) return;
    const candidateSnapshot = run?.candidates
      ? (run.candidates ?? []).map((c) => ({ ...c }))
      : null;
    setRun((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        candidates: patchCandidatesDisposition(prev.candidates, candidateIds, body),
      };
    });
    setDispositionBusy(true);
    setDispositionError(null);
    setDispositionSuccess(null);
    const flashDisposition = (ids) => {
      setDispositionFlashIds(ids);
      window.setTimeout(() => setDispositionFlashIds([]), 600);
    };
    try {
      const payload = { ...body, push_to_recruitee: pushToRecruitee };
      if (candidateIds.length === 1) {
        const res = await api.runs.setDisposition(runId, candidateIds[0], payload);
        updateCandidateInRun(res.candidate, run?.score_range ?? null);
        const baseLabel = dispositionSuccessLabel(body, res.candidate.name, jobSource === 'recruitee');
        if (pushToRecruitee && res.sync_status === 'failed') {
          const errMsg = `Saved in Caliper, but Recruitee sync failed: ${res.sync_error ?? 'unknown error'}`;
          setDispositionError(errMsg);
          showToast({ message: errMsg, tone: 'bad' });
        } else if (pushToRecruitee && res.sync_status === 'synced') {
          applyLiveRecruiteeOverlay(candidateIds, body);
          const msg = `${baseLabel} Pushed to Recruitee.`;
          setDispositionSuccess(msg);
          showToast({ message: msg, tone: 'ok' });
          flashDisposition(candidateIds);
        } else {
          setDispositionSuccess(baseLabel);
          showToast({ message: baseLabel, tone: 'ok' });
          flashDisposition(candidateIds);
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
          const errMsg = `Updated ${res.updated_count} of ${candidateIds.length}. ${res.errors[0]?.error ?? 'Some updates failed.'}`;
          setDispositionError(errMsg);
          showToast({ message: errMsg, tone: 'bad' });
        } else if (failedSync.length) {
          const errMsg = `${movedLabel} in Caliper, but ${failedSync.length} failed to sync to Recruitee: ${failedSync[0]?.recruitee_sync_error ?? 'unknown error'}`;
          setDispositionError(errMsg);
          showToast({ message: errMsg, tone: 'bad' });
        } else {
          if (pushToRecruitee) {
            const syncedIds = res.candidates
              .filter((c) => c.recruitee_sync_status === 'synced')
              .map((c) => c.id);
            applyLiveRecruiteeOverlay(syncedIds.length ? syncedIds : candidateIds, body);
          }
          const msg = `${movedLabel}${pushToRecruitee ? ' and pushed to Recruitee' : ''}.`;
          setDispositionSuccess(msg);
          showToast({ message: msg, tone: 'ok' });
          flashDisposition(candidateIds);
        }
      }
    } catch (e) {
      if (candidateSnapshot) {
        setRun((prev) => (prev ? { ...prev, candidates: candidateSnapshot } : prev));
      }
      const message = e instanceof Error ? e.message : 'Could not save pipeline decision';
      setDispositionError(message);
      showToast({ message, tone: 'bad' });
    } finally {
      setDispositionBusy(false);
      setPushModal(null);
    }
  };

  const candidates = run?.candidates ?? [];
  const isRecruiteeJob = jobSource === 'recruitee' && Boolean(jobSourceRef);
  const hasRecruiteeCandidates = candidates.some((c) => c.recruitee_applicant_id);
  const useRecruiteePipeline = isRecruiteeJob && pipelineStages.length > 0;
  const canPushRecruitee = isRecruiteeJob;

  const guardDispositionSelection = (
    candidateIds,
    disposition,
    options,
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
    candidateIds,
    stage,
    push,
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
    candidateIds,
    disposition,
    options,
  ) => {
    const body = {
      disposition,
      ...(options?.targetStageId ? { target_stage_id: options.targetStageId } : {}),
      ...(options?.targetStageName ? { target_stage_name: options.targetStageName } : {}),
      ...(options?.requalify ? { requalify: true } : {}),
    };
    const recruiteeLinked = isRecruiteeJob
      && candidates.some(
        (c) => candidateIds.includes(c.id) && c.recruitee_applicant_id,
      );
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

  const rankByCandidateId = React.useMemo(() => {
    const byScore = [...candidates].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    const map = new Map();
    byScore.forEach((c, i) => map.set(c.id, i + 1));
    return map;
  }, [candidates]);

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
  const rows = sortCandidates(filteredRows, sortState, recruiteeStateById, rankByCandidateId);

  const nStrong = filteredRows.filter((c) => c.status === 'strong').length;
  const nPromising = filteredRows.filter((c) => c.status === 'promising').length;
  const nReviewOrFlag = filteredRows.filter((c) => c.status === 'review' || c.status === 'flagged').length;
  const nOnHold = filteredRows.filter((c) => c.disposition === 'hold').length;
  const nRejected = filteredRows.filter((c) => c.disposition === 'reject').length;
  const recruiteeDisqualifiedCount = filteredRows.filter(
    (c) => candidateShowsDisqualified(c, recruiteeStateById, useRecruiteePipeline),
  ).length;
  const recruiteeQualifiedCount = candidates.filter((c) => {
    const state = recruiteeStateFor(c, recruiteeStateById);
    return Boolean(state) && !state.disqualified;
  }).length;
  const pipelineStageGroups = useRecruiteePipeline ? groupPipelineStages(pipelineStages) : [];
  const meanConfPct = candidates.length
    ? Math.round((candidates.reduce((s, c) => s + confOrder(c.confidence), 0) / candidates.length / 3) * 100)
    : 0;

  const bulkNeedsRequalify = selectionNeedsRequalify(compareSelection, candidates, recruiteeStateById);

  const toggleStatFilter = (status) => {
    setFilterStatus((prev) => (prev === status ? 'all' : status));
  };

  const activeFilterChips = React.useMemo(() => {
    const chips = [];
    const q = candidateSearchQuery.trim();
    if (q) {
      chips.push({
        key: 'search',
        label: `Search: ${q}`,
        onRemove: () => setCandidateSearchQuery(''),
        removeLabel: 'Clear search',
      });
    }
    if (filterStatus !== 'all') {
      const statusLabels = {
        strong: 'Strong match',
        promising: 'Promising',
        review_flagged: 'Review / flagged',
        review: 'Review manually',
        flagged: 'Flagged',
      };
      chips.push({
        key: 'status',
        label: `Status: ${statusLabels[filterStatus] ?? filterStatus}`,
        onRemove: () => setFilterStatus('all'),
      });
    }
    if (filterDisposition !== 'all') {
      let dispositionLabel = filterDisposition;
      if (filterDisposition.startsWith('stage:')) {
        const stageId = filterDisposition.slice(6);
        const stage = pipelineStages.find((s) => String(s.id) === stageId);
        dispositionLabel = stage?.name ?? `Stage ${stageId}`;
      } else if (filterDisposition === 'undecided') dispositionLabel = 'Undecided';
      else if (filterDisposition === 'hold') dispositionLabel = useRecruiteePipeline ? 'On hold · Caliper' : 'On hold';
      else if (filterDisposition === 'reject') dispositionLabel = useRecruiteePipeline ? 'Disqualified' : 'Rejected';
      else if (filterDisposition === 'shortlist') dispositionLabel = 'Shortlisted';
      else if (filterDisposition === 'advanced') dispositionLabel = 'Advanced';
      chips.push({
        key: 'disposition',
        label: `${useRecruiteePipeline ? 'Pipeline' : 'Decision'}: ${dispositionLabel}`,
        onRemove: () => setFilterDisposition('all'),
      });
    }
    if (recruiteeQual !== 'all') {
      chips.push({
        key: 'recruitee',
        label: `Recruitee: ${recruiteeQual === 'qualified' ? 'Qualified' : 'Disqualified'}`,
        onRemove: () => setRecruiteeQual('all'),
      });
    }
    return chips;
  }, [
    candidateSearchQuery,
    filterStatus,
    filterDisposition,
    recruiteeQual,
    pipelineStages,
    useRecruiteePipeline,
  ]);

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

  const handleRetryPoll = () => {
    if (!runId) return;
    api.runs.get(runId).then((data) => { setRun(data); setPollError(null); }).catch(() => {});
  };

  const isProcessing = run.status === 'in_progress' || run.status === 'queued';
  if (isProcessing) {
    return (
      <div className="page results-page">
        <PageHeader
          eyebrow="Results"
          hideTitle
          subtitle={jobName && runId ? `${jobName} · Run ${runId}` : runId ? `Run ${runId}` : 'Screening results'}
        />

        <div className="row results-page__actions">
          <Btn variant="ghost" icon="chevron-left" size="sm" onClick={() => go && go('runs')}>All runs</Btn>
        </div>

        {(pollError || jobMetaError) && (
          <ResultsStatusBanners
            pollError={pollError}
            jobMetaError={jobMetaError}
            run={run}
            candidates={candidates}
            onRetryPoll={handleRetryPoll}
          />
        )}

        <ScreeningLoadingScreen jobName={jobName} queued={run.status === 'queued'} />

        <AppToast toast={toast} onDismiss={dismissToast} />
      </div>
    );
  }

  return (
    <div className="page results-page">
      <PageHeader
        eyebrow="Results"
        hideTitle
        subtitle={jobName && runId ? `${jobName} · Run ${runId}` : runId ? `Run ${runId}` : 'Screening results'}
      />

      <div className="row results-page__actions">
        <Btn variant="ghost" icon="chevron-left" size="sm" onClick={() => go && go('runs')}>All runs</Btn>
        <Btn variant="ghost" icon="download" size="sm" onClick={exportCsv} disabled={run.status === 'in_progress'}>Export CSV</Btn>
        {canEdit ? (
          <Btn variant="default" icon="copy" onClick={() => go && go('profiles', { job: jobId })}>Re-run</Btn>
        ) : (
          <Btn variant="ghost" icon="briefcase" onClick={() => go && go('profiles', { job: jobId })}>View job</Btn>
        )}
      </div>

      <div className="results-page__access">
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

      <ResultsStatusBanners
        pollError={pollError}
        jobMetaError={jobMetaError}
        run={run}
        candidates={candidates}
        onRetryPoll={handleRetryPoll}
      />

      <ResultsStatsStrip
        nStrong={nStrong}
        nPromising={nPromising}
        nReviewOrFlag={nReviewOrFlag}
        meanConfPct={meanConfPct}
        filterStatus={filterStatus}
        onToggleStatFilter={toggleStatFilter}
      />

      <FilterChips chips={activeFilterChips} />

      {(compareOpen || compareSelection.length >= 2) && (
        <div className="results-compare-crumb">
          <Icon name="columns" size={14} aria-hidden />
          <span>
            <strong>{compareSelection.length}</strong> candidate{compareSelection.length === 1 ? '' : 's'} selected for comparison
            {compareOpen && compareData ? ` · viewing side-by-side` : ''}
          </span>
          {compareOpen && (
            <Btn size="sm" variant="ghost" onClick={() => setCompareOpen(false)}>Back to list</Btn>
          )}
        </div>
      )}

      <ResultsFilterBar
        candidateSearchQuery={candidateSearchQuery}
        onSearchChange={setCandidateSearchQuery}
        filterStatus={filterStatus}
        onFilterStatusChange={setFilterStatus}
        filterDisposition={filterDisposition}
        onFilterDispositionChange={setFilterDisposition}
        useRecruiteePipeline={useRecruiteePipeline}
        pipelineStageGroups={pipelineStageGroups}
        candidates={candidates}
        nRejected={nRejected}
        nOnHold={nOnHold}
        isRecruiteeJob={isRecruiteeJob}
        recruiteeQual={recruiteeQual}
        onRecruiteeQualChange={setRecruiteeQual}
        recruiteeQualifiedCount={recruiteeQualifiedCount}
        recruiteeDisqualifiedCount={recruiteeDisqualifiedCount}
      />

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
        rankByCandidateId={rankByCandidateId}
        onSort={(key) => setSortState((prev) => cycleTableSort(prev, key) ?? { key, dir: 'desc' })}
        dispositionFlashIds={dispositionFlashIds}
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
        <CandidateDetailSheet
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

      <AppToast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}

export default ResultsPage;
