// @ts-nocheck
// Page 4 — Jobs library + editor (each row is one open role / announcement).
// Primary screening path: Run screening sheet (CVs + review) from a job.
import React from 'react'
import {
  PROFILES,
  RUNS,
  HERO_PROFILE,
  RECRUITEE_JOBS,
  JOB_DESC_PREVIEW,
  getCandidateRowsForJob,
} from '@/caliper/data'
import { api } from '@/services/api'
import {
  PROVIDER_LABELS,
  SCREENING_MODELS,
  firstConfiguredModel,
  isProviderConfigured,
  labelForModel,
  modelsForProvider,
  providerForModel,
  resolveRunnableModel,
} from '@/lib/screening-models'
import {
  getCachedApplicants,
  loadRecruiteeApplicants,
  prefetchRecruiteeApplicants,
} from '@/lib/applicants-cache'
import {
  clearJobsCache,
  loadJobs,
  readJobsCache,
  shouldRunRecruiteeSync,
} from '@/lib/jobs-cache'
import { CvViewer } from '@/caliper/components/CvViewer'
import { useAuth } from '@/contexts/AuthContext'
import { runsForDisplay, shapeJobRow, formatJobDate } from '@/lib/job-profile'
import {
  getBiasWarning,
  getProtectedAttributeError,
} from '@/lib/criteria-validation'
import { ChecklistRow } from '@/caliper/components/CriteriaChecklist'
import { RelatedProfilesPane } from '@/caliper/components/RelatedProfilesPane'
import {
  RecruiteePipelineBoard,
  RecruiteePipelineTabs,
  buildPipelineListGroups,
} from '@/caliper/components/RecruiteePipelineBoard'
import { RecruiteeEvalBadge } from '@/caliper/components/RecruiteeEvalBadge'
import type { EvalSortMode } from '@/lib/recruitee-eval-sort'
import { RerunConflictAlert, formatPriorScreeningMeta } from '@/caliper/components/RerunConflictAlert'
import type { JobPriorScreening } from '@/services/api'
import { JobsListView } from '@/caliper/components/jobs/JobsListView'
import { JobTabNav } from '@/caliper/components/jobs/JobTabNav'
import { JobsPanel } from '@/caliper/components/jobs/JobsPanel'
import {
  shapeJobsList,
  sortJobProfiles,
  cycleJobTableSort,
  getCriteriaListsForProfile,
} from '@/caliper/components/jobs/jobs-utils'
import {
  Icon,
  Btn,
  IconBtn,
  Badge,
  StatusBadge,
  RunStatusBadge,
  Chip,
  Confidence,
  ScoreBar,
  Segmented,
  Toggle,
  Field,
  PageEmpty,
  RunScreeningBtn,
} from '@/caliper/ui'
import { JobsPageLoading } from '@/caliper/pages/profiles/JobsPageLoading'
import { matchesTextQuery } from '@/lib/text-search'

function formatFileSizeJob(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}



function delayJob(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPriorScreeningIndex(screenings: JobPriorScreening[]) {
  const byRecruiteeId = new Map();

  for (const s of screenings ?? []) {
    const id = s.recruitee_applicant_id;
    if (!id || String(id) === 'undefined') continue;
    const key = String(id);
    const existing = byRecruiteeId.get(key);
    if (existing) existing.count += 1;
    else byRecruiteeId.set(key, { latest: s, count: 1 });
  }
  return { byRecruiteeId };
}

/** Match prior screenings by Recruitee applicant id only (never email — avoids false positives). */
function lookupPriorForRow(row, priorIndex) {
  return priorIndex.byRecruiteeId.get(applicantIdForRow(row)) ?? null;
}

function isPriorScreenedRow(row, priorIndex) {
  return priorIndex.byRecruiteeId.has(applicantIdForRow(row));
}

/** Already-screened applicants are never shown in the run screening list. */
function isRunSheetRowVisible(row, _rowIndex, _rowSel, priorIndex) {
  return !isPriorScreenedRow(row, priorIndex);
}

function lookupPriorConflict(row, rowIndex, priorIndex) {
  const hit = lookupPriorForRow(row, priorIndex);
  if (!hit?.latest?.run_id) return null;
  return {
    rowIndex,
    applicantId: String(row.id),
    name: row.name,
    run_id: hit.latest.run_id,
    run_status: hit.latest.run_status,
    run_created_at: hit.latest.run_created_at,
    score: hit.latest.score,
    priorRunCount: hit.count,
  };
}

/** null = every applicant in the current list is selected. */
function pickInitialApplicantSelection(apps, initialStage) {
  if (!initialStage || initialStage === 'all') return null;
  const ids = new Set();
  for (const a of apps) {
    const stage = a.status || a.stage_name || 'No stage set';
    if (stage === initialStage) ids.add(String(a.id));
  }
  return ids;
}

function applicantIdForRow(row) {
  return String(row?.id);
}

function effectiveApplicantIdSet(selectedIds, rows) {
  const allIds = rows.map((r) => applicantIdForRow(r));
  return selectedIds === null ? new Set(allIds) : new Set(selectedIds);
}

/** Build selection for run sheet, skipping applicants already screened on this job. */
function buildRunSheetSelection(rows, priorIndex, mode, stage) {
  const next = new Set();
  for (const row of rows) {
    if (mode === 'stage' && row.stage !== stage) continue;
    if (isPriorScreenedRow(row, priorIndex)) continue;
    next.add(applicantIdForRow(row));
  }
  return next;
}

function excludePriorScreenedFromSelection(selectedIds, rows, priorScreenings) {
  const index = buildPriorScreeningIndex(priorScreenings);
  if (index.byRecruiteeId.size === 0) return { next: selectedIds, changed: false };
  const next = effectiveApplicantIdSet(selectedIds, rows);
  let changed = false;
  for (const row of rows) {
    const id = applicantIdForRow(row);
    if (index.byRecruiteeId.has(id) && next.has(id)) {
      next.delete(id);
      changed = true;
    }
  }
  return { next: changed ? next : selectedIds, changed };
}

function RunScreeningSheet({ profile: initialProfile, initialStage, onClose, go, onEditCriteria }) {
  const [profile, setProfile] = React.useState(initialProfile);
  const [workspaceSettings, setWorkspaceSettings] = React.useState(null);

  React.useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  React.useEffect(() => {
    api.settings.get().then(setWorkspaceSettings).catch(() => setWorkspaceSettings(null));
  }, []);

  React.useEffect(() => {
    if (!initialProfile.id || initialProfile.id === HERO_PROFILE.id) return;
    api.jobs
      .get(initialProfile.id)
      .then((job) => setProfile(shapeJobRow(job as unknown as Record<string, unknown>)))
      .catch(() => {});
  }, [initialProfile.id]);

  const preferredModel = profile.screeningModel || workspaceSettings?.default_model || 'claude-sonnet-4-6';
  const runnable = React.useMemo(
    () => resolveRunnableModel(preferredModel, workspaceSettings?.allowed_models, workspaceSettings),
    [preferredModel, workspaceSettings],
  );

  const criteria = React.useMemo(() => getCriteriaListsForProfile(profile), [profile]);
  const criteriaCount = criteria.must.length + criteria.nice.length + criteria.flag.length;
  const hasCriteria = criteriaCount > 0;

  const [step, setStep] = React.useState(1);
  const [cvMode, setCvMode] = React.useState(profile.source === 'recruitee' ? 'recruitee' : 'manual');
  const [selectedApplicantIds, setSelectedApplicantIds] = React.useState(null);
  const [stageScope, setStageScope] = React.useState(initialStage ?? 'all');

  React.useEffect(() => {
    if (initialStage != null) setStageScope(initialStage);
  }, [initialStage]);
  const [uploadedFiles, setUploadedFiles] = React.useState([]);
  const [recruiteeApplicants, setRecruiteeApplicants] = React.useState([]);
  const [recruiteeLoading, setRecruiteeLoading] = React.useState(false);
  const [runProcessing, setRunProcessing] = React.useState(null);
  const [runError, setRunError] = React.useState(null);
  const [runNote, setRunNote] = React.useState('');
  const [priorScreenings, setPriorScreenings] = React.useState([]);
  const [priorScreeningsReady, setPriorScreeningsReady] = React.useState(false);
  const [usageEstimate, setUsageEstimate] = React.useState(null);
  const runCancelRef = React.useRef(false);
  const fileInputRef = React.useRef(null);
  const autoExcludedPriorRef = React.useRef(false);
  const applicantSelectionInitializedRef = React.useRef(false);
  const isHero = profile.id === HERO_PROFILE.id;

  React.useEffect(() => {
    setStep(1);
    setCvMode(profile.source === 'recruitee' ? 'recruitee' : 'manual');
    setSelectedApplicantIds(null);
    setUploadedFiles([]);
    setRunProcessing(null);
    setRunError(null);
    setRunNote('');
    autoExcludedPriorRef.current = false;
    applicantSelectionInitializedRef.current = false;
    runCancelRef.current = false;
  }, [profile.id]);

  React.useEffect(() => () => { runCancelRef.current = true; }, []);

  React.useEffect(() => {
    if (isHero || !profile?.id) {
      setPriorScreenings([]);
      setPriorScreeningsReady(false);
      return;
    }
    let cancelled = false;
    setPriorScreeningsReady(false);
    api.jobs.priorScreenings(profile.id)
      .then(({ screenings }) => {
        if (!cancelled) {
          setPriorScreenings(screenings ?? []);
          setPriorScreeningsReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPriorScreenings([]);
          setPriorScreeningsReady(true);
        }
      });
    return () => { cancelled = true; };
  }, [profile.id, isHero]);

  React.useEffect(() => {
    if (!profile.sourceRef || profile.source !== 'recruitee') {
      setRecruiteeApplicants([]);
      setRecruiteeLoading(false);
      return;
    }
    const pickInitial = (apps) => pickInitialApplicantSelection(apps, initialStage);
    const seedApplicantSelection = (apps) => {
      if (applicantSelectionInitializedRef.current) return;
      applicantSelectionInitializedRef.current = true;
      setSelectedApplicantIds(pickInitial(apps));
    };
    let cancelled = false;
    const cached = getCachedApplicants(profile.sourceRef);
    if (cached?.applicants?.length) {
      setRecruiteeApplicants(cached.applicants);
      seedApplicantSelection(cached.applicants);
      setRecruiteeLoading(false);
    } else {
      setRecruiteeLoading(true);
    }
    loadRecruiteeApplicants(profile.sourceRef)
      .then((data) => {
        if (cancelled) return;
        setRecruiteeApplicants(data.applicants);
        seedApplicantSelection(data.applicants);
      })
      .catch(() => {
        if (!cancelled) setRecruiteeApplicants([]);
      })
      .finally(() => {
        if (!cancelled) setRecruiteeLoading(false);
      });
    return () => { cancelled = true; };
  }, [profile.id, profile.sourceRef, profile.source, initialStage]);

  const rows = recruiteeApplicants.map((a) => {
    const hasDirectCv = Boolean(a.cv_url?.startsWith('http'));
    const hasFetchableCv =
      hasDirectCv || Boolean(a.cv_url?.startsWith('recruitee-applicant:'));
    return {
      id: a.id,
      placement_id: a.placement_id ?? null,
      name: a.name || 'Unknown',
      email: a.email ?? null,
      loc: a.location || '—',
      stage: a.status || a.stage_name || 'No stage set',
      cv_url: a.cv_url,
      status: hasFetchableCv ? 'ok' : 'warn',
      cvLabel: hasDirectCv ? 'Attached' : hasFetchableCv ? 'On Recruitee' : 'Missing',
      reason: hasFetchableCv ? '' : 'No CV attached in Recruitee',
    };
  });

  const priorIndex = React.useMemo(
    () => buildPriorScreeningIndex(priorScreenings),
    [priorScreenings],
  );

  const rowSel = React.useMemo(() => {
    return rows.map((r) => {
      if (isPriorScreenedRow(r, priorIndex)) return false;
      if (selectedApplicantIds === null) return true;
      return selectedApplicantIds.has(applicantIdForRow(r));
    });
  }, [rows, selectedApplicantIds, priorIndex]);

  const nSelectedRec = rowSel.filter(Boolean).length;
  const nWarnSelected = rows.filter((c, i) => rowSel[i] && c.status === 'warn').length;

  const runSheetVisibleRows = React.useMemo(
    () => rows.map((r, i) => isRunSheetRowVisible(r, i, rowSel, priorIndex)),
    [rows, rowSel, priorIndex],
  );

  const runSheetVisibleCount = runSheetVisibleRows.filter(Boolean).length;

  const visibleStageCounts = React.useMemo(() => {
    const counts = {};
    rows.forEach((r, i) => {
      if (!runSheetVisibleRows[i]) return;
      counts[r.stage] = (counts[r.stage] ?? 0) + 1;
    });
    return counts;
  }, [rows, runSheetVisibleRows]);

  const nExcludedScreened = React.useMemo(
    () => rows.filter((r) => isPriorScreenedRow(r, priorIndex)).length,
    [rows, priorIndex],
  );

  React.useEffect(() => {
    if (autoExcludedPriorRef.current) return;
    if (cvMode !== 'recruitee' || recruiteeLoading || isHero) return;
    if (!recruiteeApplicants.length) return;
    if (!priorScreeningsReady) return;

    autoExcludedPriorRef.current = true;
    const { next, changed } = excludePriorScreenedFromSelection(
      selectedApplicantIds,
      rows,
      priorScreenings,
    );
    if (changed) {
      setSelectedApplicantIds(next);
      setStageScope('custom');
    }
  }, [
    cvMode,
    recruiteeLoading,
    isHero,
    priorScreenings,
    priorScreeningsReady,
    recruiteeApplicants,
    rows,
    selectedApplicantIds,
  ]);

  // Pipeline stages (segments), preserving the incoming order from Recruitee.
  const stageOrder = [];
  const stageCounts = {};
  rows.forEach((r) => {
    if (!(r.stage in stageCounts)) { stageCounts[r.stage] = 0; stageOrder.push(r.stage); }
    stageCounts[r.stage] += 1;
  });
  const sheetGroups = stageOrder.map((stage) => ({
    stage,
    rows: rows
      .map((r, i) => ({ r, i }))
      .filter((x) => x.r.stage === stage && runSheetVisibleRows[x.i]),
  }));

  const visibleSheetGroups =
    stageScope === 'all' || stageScope === 'custom'
      ? sheetGroups
      : sheetGroups.filter((g) => g.stage === stageScope);

  const applyStageScope = (stage) => {
    setStageScope(stage);
    if (stage === 'all') {
      setSelectedApplicantIds(buildRunSheetSelection(rows, priorIndex, 'all'));
      return;
    }
    setSelectedApplicantIds(buildRunSheetSelection(rows, priorIndex, 'stage', stage));
  };
  const toggleRecruiteeRow = (i) => {
    const row = rows[i];
    if (!row || isPriorScreenedRow(row, priorIndex)) return;
    const id = applicantIdForRow(row);
    if (!id || id === 'undefined') return;
    setSelectedApplicantIds((prev) => {
      const next = effectiveApplicantIdSet(prev, rows);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setStageScope('custom');
  };
  const toggleStageRows = (stage, select) => {
    setSelectedApplicantIds((prev) => {
      const next = effectiveApplicantIdSet(prev, rows);
      for (let idx = 0; idx < rows.length; idx++) {
        if (rows[idx].stage !== stage) continue;
        const id = applicantIdForRow(rows[idx]);
        if (!id || id === 'undefined') continue;
        if (select) {
          if (!isPriorScreenedRow(rows[idx], priorIndex)) next.add(id);
        } else {
          next.delete(id);
        }
      }
      return next;
    });
    setStageScope('custom');
  };

  const rerunConflicts = React.useMemo(() => {
    if (cvMode !== 'recruitee') return [];
    const list = [];
    rows.forEach((row, i) => {
      if (!rowSel[i] || row.status !== 'ok') return;
      const conflict = lookupPriorConflict(row, i, priorIndex);
      if (conflict) list.push(conflict);
    });
    return list;
  }, [cvMode, rows, rowSel, priorIndex]);

  const deselectConflict = React.useCallback((rowIndex) => {
    const applicantId = applicantIdForRow(rows[rowIndex]);
    if (!applicantId || applicantId === 'undefined') return;
    setSelectedApplicantIds((prev) => {
      const next = effectiveApplicantIdSet(prev, rows);
      next.delete(applicantId);
      return next;
    });
    setStageScope('custom');
  }, [rows]);

  const deselectAllConflicts = React.useCallback(() => {
    setSelectedApplicantIds((prev) => {
      const next = effectiveApplicantIdSet(prev, rows);
      rows.forEach((row) => {
        const id = applicantIdForRow(row);
        if (row.status === 'ok' && id && id !== 'undefined' && priorIndex.byRecruiteeId.has(id)) {
          next.delete(id);
        }
      });
      return next;
    });
    setStageScope('custom');
  }, [rows, priorIndex]);

  const addUploadedFiles = (fileList) => {
    const maxBytes = 25 * 1024 * 1024;
    const next = [...uploadedFiles];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      if (!f || !f.name) continue;
      if (f.size > maxBytes) continue;
      const lower = f.name.toLowerCase();
      if (!lower.endsWith('.pdf') && !lower.endsWith('.docx') && !lower.endsWith('.doc')) continue;
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      next.push({
        id: `up-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        name: f.name,
        size: f.size,
      });
    }
    setUploadedFiles(next);
  };

  const cvSum = {
    selected: cvMode === 'manual' ? uploadedFiles.length : rowSel.filter(Boolean).length,
    warnings: cvMode === 'recruitee' ? nWarnSelected : 0,
    noteLines: cvMode === 'manual'
      ? (uploadedFiles.length ? uploadedFiles.map((f) => `${f.name} · ${formatFileSizeJob(f.size)}`) : ['No files added yet.'])
      : (nWarnSelected > 0 ? rows.filter((c, i) => rowSel[i] && c.status === 'warn').map((c) => `${c.name} — ${c.reason}`) : ['No parse warnings.']),
  };

  React.useEffect(() => {
    if (step !== 2 || isHero || !cvSum.selected) {
      setUsageEstimate(null);
      return;
    }
    let cancelled = false;
    api.usage.estimate({
      cv_count: cvSum.selected,
      criteria_count: criteriaCount,
      model: runnable.modelId,
    })
      .then((est) => { if (!cancelled) setUsageEstimate(est); })
      .catch(() => { if (!cancelled) setUsageEstimate(null); });
    return () => { cancelled = true; };
  }, [step, isHero, cvSum.selected, criteriaCount, runnable.modelId]);

  const budgetBlocked = usageEstimate?.status === 'blocked';
  const budgetWarn = usageEstimate?.status === 'warn';

  const formatEstUsd = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return '—';
    return v < 0.01 ? `$${v.toFixed(4)}` : v < 1 ? `$${v.toFixed(3)}` : `$${v.toFixed(2)}`;
  };

  const canRun =
    hasCriteria
    && !runnable.error
    && !budgetBlocked
    && !(cvMode === 'manual' && uploadedFiles.length === 0)
    && !(cvMode === 'recruitee' && !rowSel.some(Boolean));

  const continueBlockedReason = !hasCriteria
    ? 'Add and save at least one criterion on the Criteria tab first'
    : budgetBlocked
      ? 'AI credits exhausted'
    : runnable.error
      ? runnable.error
      : cvMode === 'recruitee' && !rowSel.some(Boolean)
        ? 'Select at least one applicant'
        : cvMode === 'manual' && !uploadedFiles.length
          ? 'Upload at least one CV'
          : null;

  const startRealRun = React.useCallback(async () => {
    if (!canRun) return;
    runCancelRef.current = false;
    setRunError(null);
    try {
      let cvSources = [];
      if (cvMode === 'manual') {
        const total = uploadedFiles.length;
        setRunProcessing({ label: 'Uploading CVs…', progress: 5 });
        for (let i = 0; i < uploadedFiles.length; i++) {
          if (runCancelRef.current) { setRunProcessing(null); return; }
          const { path, filename } = await api.cv.upload(uploadedFiles[i].file);
          cvSources.push({ type: 'storage', path, name: filename });
          setRunProcessing({ label: `Uploading CVs… (${i + 1}/${total})`, progress: Math.round(((i + 1) / total) * 75) });
        }
      } else {
        const sel = rowSel;
        cvSources = rows
          .filter((r, i) => sel[i] && r.status === 'ok')
          .map((r) => ({
            type: 'recruitee',
            applicant_id: r.id,
            placement_id: r.placement_id ?? undefined,
            cv_url: r.cv_url?.startsWith('http')
              ? r.cv_url
              : `recruitee-applicant:${r.id}`,
            name: r.name,
            ...(r.email ? { email: r.email } : {}),
          }));
      }
      if (runCancelRef.current) { setRunProcessing(null); return; }
      setRunProcessing({ label: 'Starting screening run…', progress: 85 });
      const modelId = profile.screeningModel || undefined;
      const created = await api.runs.create({
        job_id: profile.id,
        cv_sources: cvSources,
        ...(modelId ? { model_id: modelId } : {}),
        ...(runNote.trim() ? { run_note: runNote.trim() } : {}),
      });
      const { run_id } = created;
      if (created.model_notice) {
        setRunError(created.model_notice);
        await delayJob(2500);
        setRunError(null);
      }
      setRunProcessing({ label: 'Run created — opening results…', progress: 100 });
      await delayJob(300);
      if (runCancelRef.current) { setRunProcessing(null); return; }
      setRunProcessing(null);
      onClose();
      go('results', run_id);
    } catch (err) {
      setRunProcessing(null);
      setRunError(err?.message ?? 'Failed to start run. Please try again.');
    }
  }, [canRun, cvMode, uploadedFiles, rowSel, rows, profile.id, profile.screeningModel, runNote, go, onClose]);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="detail detail--centered" onClick={onClose}>
      <div className="run-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="run-sheet__head">
          <div>
            <p className="run-sheet__eyebrow">Run screening</p>
            <h2 className="run-sheet__title">{profile.name}</h2>
            <p className="run-sheet__sub">
              {profile.dept} · {criteriaCount} saved criteria · {labelForModel(runnable.modelId)}
              {runnable.substituted && profile.screeningModel && runnable.modelId !== profile.screeningModel
                ? ` (substituted — add key for ${labelForModel(profile.screeningModel)})`
                : ''}
            </p>
          </div>
          <IconBtn name="x" size={16} onClick={onClose} aria-label="Close run screening" />
        </div>

        <div className="run-sheet__body">
        <div className="run-sheet__steps" role="tablist" aria-label="Run screening steps">
          <button
            type="button"
            role="tab"
            aria-selected={step === 1}
            className={`run-sheet__step${step === 1 ? ' is-active' : ''}`}
            onClick={() => setStep(1)}
          >
            <span className="run-sheet__step-num">1</span>
            Select CVs
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={step === 2}
            className={`run-sheet__step${step === 2 ? ' is-active' : ''}`}
            onClick={() => setStep(2)}
          >
            <span className="run-sheet__step-num">2</span>
            Review &amp; run
          </button>
        </div>

          {!hasCriteria && (
            <div className="callout" style={{ marginBottom: 16 }}>
              Add at least one criterion on this job&apos;s <strong>Criteria</strong> tab and click{' '}
              <strong>Save criteria &amp; model</strong> before continuing. Screening always uses a saved rubric.
              {onEditCriteria && (
                <div style={{ marginTop: 10 }}>
                  <Btn size="sm" variant="default" icon="edit" onClick={onEditCriteria}>
                    Set up criteria
                  </Btn>
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <>
              <p className="wiz__pane-sub" style={{ marginBottom: 14 }}>
                Pull applicants from Recruitee when this job is linked, or upload PDF / DOCX files.
              </p>
              <div className="run-sheet__source-cards">
                <button
                  type="button"
                  className={`run-sheet__source-card${cvMode === 'recruitee' ? ' is-selected' : ''}`}
                  onClick={() => setCvMode('recruitee')}
                >
                  <div className="run-sheet__source-card__title">
                    <Icon name="database" size={16} aria-hidden />
                    Recruitee applicants
                  </div>
                  <div className="run-sheet__source-card__sub">
                    {recruiteeLoading
                      ? 'Loading…'
                      : `${rows.length} applicant${rows.length === 1 ? '' : 's'} available`}
                  </div>
                </button>
                <button
                  type="button"
                  className={`run-sheet__source-card${cvMode === 'manual' ? ' is-selected' : ''}`}
                  onClick={() => setCvMode('manual')}
                >
                  <div className="run-sheet__source-card__title">
                    <Icon name="upload" size={16} aria-hidden />
                    Upload CVs
                  </div>
                  <div className="run-sheet__source-card__sub">
                    {uploadedFiles.length
                      ? `${uploadedFiles.length} file${uploadedFiles.length === 1 ? '' : 's'} added`
                      : 'PDF or DOCX from your computer'}
                  </div>
                </button>
              </div>

              {cvMode === 'recruitee' && profile.source !== 'recruitee' && (
                <div className="callout" style={{ marginTop: 12, marginBottom: 0 }}>
                  This job is not linked to a Recruitee position. Switch to <strong>Upload</strong> to add CVs manually.
                </div>
              )}
              {cvMode === 'manual' ? (
                <div className="col" style={{ marginTop: 18, gap: 14 }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="sr-only"
                    accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                    multiple
                    onChange={(e) => {
                      addUploadedFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <div
                    className="dropzone dropzone--interactive"
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (e.dataTransfer.files && e.dataTransfer.files.length) addUploadedFiles(e.dataTransfer.files);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Icon name="upload" size={22} className="muted"/>
                    <div style={{ marginTop: 10, fontSize: 14 }}>
                      Drag <strong>PDF</strong> or <strong>DOCX</strong> here, or <button type="button" className="linkish" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>browse</button>.
                    </div>
                  </div>
                  {uploadedFiles.length > 0 && (
                    <div className="card">
                      <div className="card__head">
                        <span className="card__title" style={{ fontSize: 13 }}>Files</span>
                        <Btn size="sm" variant="ghost" onClick={() => setUploadedFiles([])}>Remove all</Btn>
                      </div>
                      <div className="card__body" style={{ paddingTop: 0 }}>
                        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                          {uploadedFiles.map((f) => (
                            <li key={f.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
                              <span style={{ fontSize: 13 }}>{f.name}</span>
                              <Btn size="sm" variant="ghost" onClick={() => setUploadedFiles(uploadedFiles.filter((x) => x.id !== f.id))}>Remove</Btn>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="col" style={{ marginTop: 18, gap: 12 }}>
                  {recruiteeLoading ? (
                    <div className="muted" style={{ padding: 24, textAlign: 'center', fontSize: 13 }}>Loading applicants from Recruitee…</div>
                  ) : rows.length === 0 ? (
                    <div className="callout">No applicants found in Recruitee for this position.</div>
                  ) : (
                    <>
                      <div className="wiz__pane-sub" style={{ marginBottom: 2 }}>
                        Screen everyone, or pick a pipeline stage to screen just that segment.
                      </div>
                      <div className="seg-chips">
                        <button
                          type="button"
                          className={`seg-chip${stageScope === 'all' ? ' is-active' : ''}`}
                          onClick={() => applyStageScope('all')}
                        >
                          All stages <span className="seg-chip__n">{runSheetVisibleCount}</span>
                        </button>
                        {stageOrder.map((stage) => (
                          <button
                            key={stage}
                            type="button"
                            className={`seg-chip${stageScope === stage ? ' is-active' : ''}`}
                            onClick={() => applyStageScope(stage)}
                          >
                            {stage} <span className="seg-chip__n">{visibleStageCounts[stage] ?? 0}</span>
                          </button>
                        ))}
                      </div>
                      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span className="muted" style={{ fontSize: 12 }}>
                          {stageScope === 'all'
                            ? 'Screening every applicant.'
                            : stageScope === 'custom'
                              ? 'Custom selection.'
                              : <>Screening the <strong>{stageScope}</strong> stage.</>}
                          {' '}<span className="mono">{nSelectedRec}</span> of <span className="mono">{rows.length}</span> selected.
                        </span>
                        {nWarnSelected > 0
                          ? <Badge tone="warn" dot>{nWarnSelected} without CV</Badge>
                          : <Badge tone="ok" dot>All have CVs</Badge>}
                      </div>
                      {nExcludedScreened > 0 && (
                        <div className="callout" style={{ fontSize: 12, marginBottom: 0 }}>
                          <strong>{nExcludedScreened}</strong> applicants were already screened on this job and are hidden from this list.
                        </div>
                      )}
                      {rerunConflicts.length > 0 && (
                        <RerunConflictAlert
                          conflicts={rerunConflicts}
                          onRemove={deselectConflict}
                          onRemoveAll={deselectAllConflicts}
                        />
                      )}
                      <div className="run-sheet__table card">
                        <table className="tbl">
                          <thead>
                            <tr>
                              <th style={{ width: 32 }}/>
                              <th>Applicant</th>
                              <th style={{ width: 120 }}>Location</th>
                              <th>CV</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleSheetGroups.map((g) => {
                              if (g.rows.length === 0) return null;
                              const groupSel = g.rows.filter((x) => rowSel[x.i]).length;
                              const allSel = groupSel === g.rows.length;
                              return (
                                <React.Fragment key={g.stage}>
                                  <tr className="tbl-group">
                                    <td colSpan={4}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <span className="tbl-group__label">
                                          <span className="tbl-group__dot" />
                                          {g.stage}
                                        </span>
                                        <span className="tbl-group__count">{groupSel}/{g.rows.length} selected</span>
                                        <Btn
                                          size="sm"
                                          variant="ghost"
                                          style={{ marginLeft: 'auto' }}
                                          onClick={() => toggleStageRows(g.stage, !allSel)}
                                        >
                                          {allSel ? 'Clear' : 'Select stage'}
                                        </Btn>
                                      </div>
                                    </td>
                                  </tr>
                                  {g.rows.map(({ r: c, i }) => (
                                    <tr
                                      key={c.id}
                                      className={rowSel[i] ? 'is-selected' : ''}
                                      onClick={() => toggleRecruiteeRow(i)}
                                      style={{ cursor: 'pointer' }}
                                    >
                                      <td>
                                        <span style={{
                                          display: 'inline-grid', placeItems: 'center', width: 16, height: 16,
                                          border: `1.5px solid ${rowSel[i] ? 'var(--brand-primary)' : 'var(--faint)'}`,
                                          background: rowSel[i] ? 'var(--brand-primary)' : 'var(--surface)',
                                          borderRadius: 3, color: 'var(--bg)',
                                        }}>{rowSel[i] && <Icon name="check" size={10} stroke={2.4}/>}</span>
                                      </td>
                                      <td>
                                        <strong style={{ fontWeight: 500 }}>{c.name}</strong>
                                        {(() => {
                                          const priorMeta = formatPriorScreeningMeta(lookupPriorForRow(c, priorIndex)?.latest);
                                          return priorMeta ? (
                                            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{priorMeta}</div>
                                          ) : null;
                                        })()}
                                      </td>
                                      <td className="muted">{c.loc}</td>
                                      <td>
                                        {c.status === 'ok'
                                          ? <Badge tone="ok" dot>{c.cvLabel}</Badge>
                                          : <span className="row" style={{ gap: 6 }}><Badge tone="warn" dot>Missing</Badge><span className="muted" style={{ fontSize: 11 }}>{c.reason}</span></span>}
                                      </td>
                                    </tr>
                                  ))}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <div className="col" style={{ gap: 12 }}>
              {runnable.error && (
                <div className="callout" style={{ color: 'var(--bad-ink)' }}>{runnable.error}</div>
              )}
              {budgetBlocked && (
                <div className="callout" style={{ color: 'var(--bad-ink)' }}>
                  AI credits exhausted. You cannot start new screenings until your admin adds credits.{' '}
                  <a href="/usage" style={{ color: 'inherit' }}>View usage →</a>
                </div>
              )}
              {budgetWarn && !budgetBlocked && (
                <div className="callout" style={{ color: 'var(--warn-ink, #b45309)' }}>
                  Low credits ({usageEstimate?.pct_used ?? '—'}% used). This run adds ~{formatEstUsd(usageEstimate?.estimated_cost_usd)}.
                </div>
              )}
              {usageEstimate && !budgetBlocked && !budgetWarn && usageEstimate.budget_usd != null && (
                <div className="callout muted" style={{ fontSize: 12.5 }}>
                  ~{formatEstUsd(usageEstimate.estimated_cost_usd)} estimated · {formatEstUsd(usageEstimate.spent_usd)} spent of {formatEstUsd(usageEstimate.budget_usd)} allocated ({usageEstimate.pct_used ?? 0}%)
                </div>
              )}
              {usageEstimate && usageEstimate.budget_usd == null && (
                <div className="callout muted" style={{ fontSize: 12.5 }}>
                  ~{formatEstUsd(usageEstimate.estimated_cost_usd)} estimated for this run · pay as you go (unlimited)
                </div>
              )}
              {runnable.substituted && !runnable.error && (
                <div className="callout">
                  Screening will use <strong>{labelForModel(runnable.modelId)}</strong> because the job&apos;s
                  model has no API key configured. Add keys in Settings → AI provider.
                </div>
              )}
              {cvMode === 'recruitee' && rerunConflicts.length > 0 && (
                <RerunConflictAlert
                  conflicts={rerunConflicts}
                  onRemove={deselectConflict}
                  onRemoveAll={deselectAllConflicts}
                />
              )}
              <div className="card">
                <div className="card__head">
                  <span className="card__title" style={{ fontSize: 12 }}>Scoring configuration</span>
                  <span className="mono muted" style={{ fontSize: 11 }}>{criteriaCount} checklist items</span>
                </div>
                <div className="card__body col" style={{ gap: 12, paddingTop: 8 }}>
                  <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, margin: 0 }}>
                    Each CV is scored against this rubric. Every line is <strong>Met</strong> or <strong>Not met</strong> (binary).
                    Overall score = % of must + nice met, minus red-flag deductions.
                  </p>
                  {[
                    { kind: 'must', label: 'Must-haves', items: criteria.must },
                    { kind: 'nice', label: 'Nice-to-have', items: criteria.nice },
                    { kind: 'flag', label: 'Red flags', items: criteria.flag },
                  ].filter((s) => s.items.length > 0).map((sec) => (
                    <div key={sec.kind}>
                      <div className="eval-sec">
                        <span>{sec.label}</span>
                        <span className="eval-sec__line"/>
                        <span className="mono">{sec.items.length}</span>
                      </div>
                      {sec.items.map((it) => (
                        <ChecklistRow
                          key={it.id}
                          name={it.name}
                          met={false}
                          kind={sec.kind}
                          weight={it.weight}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <div className="card__head">
                  <span className="card__title" style={{ fontSize: 12 }}>CVs</span>
                </div>
                <div className="card__body">
                  <div className="row" style={{ gap: 24 }}>
                    <div><div className="stats__lbl">Selected</div><div style={{ fontSize: 20, fontWeight: 500 }}>{cvSum.selected}</div></div>
                    <div><div className="stats__lbl">Parse warnings</div><div style={{ fontSize: 20, fontWeight: 500, color: cvSum.warnings ? 'var(--warn-ink)' : 'var(--muted)' }}>{cvSum.warnings}</div></div>
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="card__head">
                  <span className="card__title" style={{ fontSize: 12 }}>Run note</span>
                  <span className="mono muted" style={{ fontSize: 11 }}>Optional</span>
                </div>
                <div className="card__body" style={{ paddingTop: 8 }}>
                  <textarea
                    className="ta"
                    rows={3}
                    placeholder="e.g. TA Interview batch — focus on procurement experience in EU markets"
                    value={runNote}
                    onChange={(e) => setRunNote(e.target.value)}
                    maxLength={2000}
                    aria-label="Run note"
                  />
                  <p className="muted" style={{ fontSize: 11.5, margin: '8px 0 0', lineHeight: 1.45 }}>
                    Saved with this run so you and your team can remember why it was started.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="run-sheet__foot">
          {runError && (
            <div className="callout" style={{ color: 'var(--bad)', marginBottom: 8 }}>
              {runError}
            </div>
          )}
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
            {step === 2 ? (
              <Btn variant="ghost" onClick={() => setStep(1)}>Back</Btn>
            ) : (
              <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            )}
            {step === 1 ? (
              <Btn
                variant="primary"
                iconRight="chevron-right"
                onClick={() => setStep(2)}
                disabled={!hasCriteria || (cvMode === 'manual' && !uploadedFiles.length) || (cvMode === 'recruitee' && !rowSel.some(Boolean))}
                title={continueBlockedReason || undefined}
              >
                Continue
              </Btn>
            ) : (
              <Btn variant="primary" icon="play" disabled={!canRun} onClick={startRealRun} title={budgetBlocked ? 'AI credits exhausted' : undefined}>Run now</Btn>
            )}
          </div>
        </div>
      </div>

      {runProcessing && (
        <div className="demo-run-overlay" role="dialog" aria-modal="true" aria-labelledby="run-progress-title">
          <div className="demo-run-overlay__card">
            <div className="demo-run-overlay__head">
              <div>
                <h2 id="run-progress-title" className="demo-run-overlay__title">Running screening…</h2>
                <p className="demo-run-overlay__sub">{runProcessing.label}</p>
              </div>
              <Btn variant="ghost" size="sm" onClick={() => { runCancelRef.current = true; setRunProcessing(null); }}>Cancel</Btn>
            </div>
            <div className="demo-run-overlay__progress">
              <div className="demo-run-overlay__progress-track">
                <div className="demo-run-overlay__progress-fill" style={{ width: `${runProcessing.progress}%` }}/>
              </div>
              <span className="mono muted" style={{ fontSize: 11 }}>{runProcessing.progress}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function HighlightMatches({ text, query }) {
  const q = query.trim();
  if (!q || text == null || text === '') return text;
  const parts = String(text).split(new RegExp(`(${escapeRegExp(q)})`, 'gi'));
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1
      ? <mark key={i} className="job-picker-hit">{part}</mark>
      : part,
  );
}

function PickJobToRunModal({ onClose, onPick, profiles }) {
  const [query, setQuery] = React.useState('');
  const searchRef = React.useRef(null);

  React.useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const filteredProfiles = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = profiles ?? [];
    if (!q) return list;
    return list.filter((p) =>
      p.name.toLowerCase().includes(q)
      || p.id.toLowerCase().includes(q)
      || (p.dept && p.dept.toLowerCase().includes(q)),
    );
  }, [profiles, query]);

  return (
    <div className="detail" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 92vw)',
          alignSelf: 'center',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-lg)',
          margin: 'auto',
          boxShadow: 'var(--shadow-pop)',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 500 }}>Run screening for…</h3>
          <div className="spacer"/>
          <IconBtn name="x" size={14} onClick={onClose}/>
        </div>
        <div
          style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ position: 'relative' }}>
            <input
              ref={searchRef}
              className="inp"
              placeholder="Search jobs by title…"
              style={{ paddingLeft: 32, width: '100%' }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search jobs"
            />
            <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--muted)' }}/>
          </div>
        </div>
        <div style={{ overflowY: 'auto', padding: 8 }}>
          {filteredProfiles.length === 0 ? (
            <div className="muted" style={{ padding: '18px 14px', fontSize: 12.5 }}>
              No jobs match your search.
            </div>
          ) : filteredProfiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '12px 14px', border: 0, background: 'transparent',
                borderRadius: 8, cursor: 'default',
                borderBottom: '1px solid var(--line-soft)',
              }}
            >
              <div style={{ fontWeight: 500 }}><HighlightMatches text={p.name} query={query} /></div>
              <div className="muted mono" style={{ fontSize: 11, marginTop: 2 }}>
                <HighlightMatches text={p.id} query={query} />
                {' · '}
                <HighlightMatches text={p.dept} query={query} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function allocNewProfileId() {
  const base = Date.now().toString(36).toUpperCase();
  let id = `PROF-${base}`;
  if (!PROFILES.some((p) => p.id === id)) return id;
  return `PROF-${base}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function buildProfileFromRecruiteeJob(job) {
  const postedOn = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const lastUpdated = postedOn;
  const dept = job.department ?? job.dept ?? 'General';
  const description = `Imported from Recruitee — ${job.title} (${dept}).\n\nEdit the overview to add the full job description and screening criteria.`;
  return {
    id: `REC-${job.id}`,
    name: job.title,
    dept,
    source: 'recruitee',
    sourceRef: job.id,
    status: 'open',
    postedOn,
    description,
    runsCount: 0,
    lastRun: null,
    lastUpdated,
    mustHave: [],
    niceToHave: [],
    redFlags: [],
  };
}

function buildManualProfile(title, descText) {
  const postedOn = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return {
    id: allocNewProfileId(),
    name: title.trim(),
    dept: 'General',
    source: 'manual',
    status: 'open',
    postedOn,
    description: descText.trim(),
    runsCount: 0,
    lastRun: null,
    lastUpdated: postedOn,
    mustHave: [],
    niceToHave: [],
    redFlags: [],
  };
}

function ProfilesPage({ go, route }) {
  const { canEdit, user } = useAuth();
  const userId = user?.sub ?? null;
  const initialCache = React.useMemo(() => readJobsCache(userId), [userId]);
  const [selectedId, setSelectedId] = React.useState(null);
  const [editorInitialTab, setEditorInitialTab] = React.useState(null);
  const [refreshToken, setRefreshToken] = React.useState({ n: 0, forceSync: false });
  const [showNew, setShowNew] = React.useState(false);
  const [filter, setFilter] = React.useState('all');
  const [departmentFilter, setDepartmentFilter] = React.useState('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [jobTableSort, setJobTableSort] = React.useState(null);
  const [runSheetProfileId, setRunSheetProfileId] = React.useState(null);
  const [runSheetStage, setRunSheetStage] = React.useState(null);
  const [showRunPicker, setShowRunPicker] = React.useState(false);
  const [liveProfiles, setLiveProfiles] = React.useState(() =>
    initialCache?.jobs?.length ? shapeJobsList(initialCache.jobs) : null,
  );
  const [profilesLoading, setProfilesLoading] = React.useState(!initialCache?.jobs?.length);
  const [profilesLoadError, setProfilesLoadError] = React.useState(null);
  const [loadPhase, setLoadPhase] = React.useState('Syncing open roles from Recruitee…');
  const [backgroundRefreshing, setBackgroundRefreshing] = React.useState(
    Boolean(initialCache?.jobs?.length),
  );

  const refreshProfiles = React.useCallback((opts?: { forceSync?: boolean }) => {
    setRefreshToken((t) => ({ n: t.n + 1, forceSync: Boolean(opts?.forceSync) }));
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const hadList = liveProfiles !== null;
    const cache = readJobsCache(userId);
    const needsSync = shouldRunRecruiteeSync(
      cache?.lastSyncAt ?? null,
      refreshToken.forceSync,
    );

    if (!userId) return;

    if (!hadList) {
      setProfilesLoading(true);
      setProfilesLoadError(null);
      setLiveProfiles(null);
      setLoadPhase(needsSync ? 'Syncing open roles from Recruitee…' : 'Loading your job list…');
    } else {
      setBackgroundRefreshing(true);
    }

    loadJobs({ forceSync: refreshToken.forceSync, userId })
      .then((entry) => {
        if (cancelled) return;
        setLiveProfiles(shapeJobsList(entry.jobs));
        setProfilesLoadError(null);
      })
      .catch((err) => {
        if (!cancelled && !hadList) {
          setLiveProfiles(null);
          setProfilesLoadError(err?.message ?? 'Failed to load jobs.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setProfilesLoading(false);
          setBackgroundRefreshing(false);
        }
      });

    return () => { cancelled = true; };
  }, [refreshToken.n, refreshToken.forceSync, userId]);

  const jobs = liveProfiles ?? [];
  const departmentOptions = React.useMemo(
    () => [...new Set(jobs.map((p) => p.dept).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [jobs],
  );
  const profile = selectedId && liveProfiles ? liveProfiles.find((p) => p.id === selectedId) : null;

  const deepLinkJobId = route?.deepLinkJobId ?? route?.openRunJobId ?? null;
  const screenJobId = route?.screenJobId ?? null;
  const deepLinkTab = route?.deepLinkTab ?? null;

  const mapDeepLinkTab = (tab) => {
    if (!tab) return null;
    const t = String(tab).toLowerCase();
    if (t === 'applicants' || t === 'candidates') return 'candidates';
    if (['overview', 'criteria', 'runs', 'related', 'audit'].includes(t)) return t;
    return null;
  };

  React.useEffect(() => {
    if (!liveProfiles?.length) return;

    const clearParams = () => {
      if (route?.clearSearchParams) route.clearSearchParams();
    };

    if (screenJobId && liveProfiles.some((p) => p.id === screenJobId)) {
      setRunSheetProfileId(screenJobId);
      setSelectedId(null);
      clearParams();
      return;
    }

    if (!deepLinkJobId || !liveProfiles.some((p) => p.id === deepLinkJobId)) return;

    const job = liveProfiles.find((p) => p.id === deepLinkJobId);
    if (!job) return;

    if (job.source === 'recruitee' && job.sourceRef) {
      prefetchRecruiteeApplicants(job.sourceRef);
    }

    setRunSheetProfileId(null);
    setSelectedId(deepLinkJobId);

    const mappedTab = mapDeepLinkTab(deepLinkTab);
    if (mappedTab) setEditorInitialTab(mappedTab);
    else {
      const lists = getCriteriaListsForProfile(job);
      const criteriaCount = lists.must.length + lists.nice.length + lists.flag.length;
      setEditorInitialTab(criteriaCount === 0 ? 'criteria' : null);
    }

    clearParams();
  }, [deepLinkJobId, screenJobId, deepLinkTab, liveProfiles, route]);

  if (profile) {
    return (
      <>
        <ProfileEditor
          profile={profile}
          initialTab={editorInitialTab}
          canEdit={canEdit}
          onBack={() => {
            setRunSheetProfileId(null);
            setSelectedId(null);
            setEditorInitialTab(null);
          }}
          go={go}
          onOpenRunSheet={(stage) => { setRunSheetStage(stage ?? null); setRunSheetProfileId(profile.id); }}
        />
        {canEdit && runSheetProfileId === profile.id && (
          <RunScreeningSheet
            key={`${profile.id}-${runSheetStage ?? 'all'}`}
            profile={profile}
            initialStage={runSheetStage}
            onClose={() => { setRunSheetStage(null); setRunSheetProfileId(null); }}
            go={go}
            onEditCriteria={() => {
              setRunSheetProfileId(null);
              setEditorInitialTab('criteria');
            }}
          />
        )}
      </>
    );
  }

  if (profilesLoading || liveProfiles === null) {
    return <JobsPageLoading phase={loadPhase} />;
  }

  if (profilesLoadError) {
    return (
      <JobsPageLoading
        phase={profilesLoadError}
        onRetry={() => refreshProfiles()}
      />
    );
  }

  const runSheetProfile = runSheetProfileId ? jobs.find((p) => p.id === runSheetProfileId) : null;

  const filtered = jobs.filter(p => {
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const haystack = [
        p.name,
        p.id,
        p.dept,
        p.source,
        p.sourceRef,
      ].map((v) => (v ?? '').toLowerCase());
      if (!haystack.some((s) => s.includes(q))) return false;
    }
    if (departmentFilter !== 'all' && p.dept !== departmentFilter) return false;
    if (filter === 'all') return true;
    if (filter === 'open') return p.status === 'open';
    if (filter === 'closed') return p.status === 'closed';
    if (filter === 'recruitee') return p.source === 'recruitee';
    if (filter === 'manual') return p.source === 'manual';
    return true;
  });

  const visibleJobs = sortJobProfiles(filtered, jobTableSort);

  const cycleJobSort = (key) => {
    setJobTableSort((prev) => cycleJobTableSort(prev, key));
  };

  return (
    <>
      <JobsListView
        jobs={jobs}
        filtered={filtered}
        visibleJobs={visibleJobs}
        jobTableSort={jobTableSort}
        onSort={cycleJobSort}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filter={filter}
        onFilterChange={setFilter}
        departmentFilter={departmentFilter}
        departmentOptions={departmentOptions}
        onDepartmentFilterChange={setDepartmentFilter}
        canEdit={canEdit}
        backgroundRefreshing={backgroundRefreshing}
        onRefresh={refreshProfiles}
        onNewJob={() => setShowNew(true)}
        onRunPicker={() => setShowRunPicker(true)}
        setSelectedId={setSelectedId}
        setEditorInitialTab={setEditorInitialTab}
        setRunSheetProfileId={setRunSheetProfileId}
      />

      {canEdit && showNew && (
        <NewProfileDialog
          profiles={jobs}
          onClose={() => setShowNew(false)}
          onCreate={(newProfile) => {
            const body = {
              name: newProfile.name,
              dept: newProfile.dept,
              status: newProfile.status,
              source: newProfile.source,
              source_ref: newProfile.sourceRef,
              description: newProfile.description,
              posted_on: newProfile.postedOn,
            };
            api.jobs.upsert(newProfile.id, body)
              .then(() => refreshProfiles())
              .catch((e) => setProfilesLoadError(e?.message ?? 'Failed to create job.'));
            setShowNew(false);
            setEditorInitialTab('criteria');
            setSelectedId(newProfile.id);
          }}
        />
      )}
      {canEdit && showRunPicker && (
        <PickJobToRunModal
          profiles={jobs}
          onClose={() => setShowRunPicker(false)}
          onPick={(id) => {
            setShowRunPicker(false);
            setRunSheetStage(null);
            setRunSheetProfileId(id);
          }}
        />
      )}
      {runSheetProfile && (
        <RunScreeningSheet
          key={`${runSheetProfile.id}-${runSheetStage ?? 'all'}`}
          profile={runSheetProfile}
          initialStage={runSheetStage}
          onClose={() => { setRunSheetStage(null); setRunSheetProfileId(null); }}
          go={go}
          onEditCriteria={() => {
            const jobId = runSheetProfileId;
            setRunSheetProfileId(null);
            setEditorInitialTab('criteria');
            setSelectedId(jobId);
          }}
        />
      )}
    </>
  );
}

/* ─── New job dialog ─────────────────────────────────────── */
function NewProfileDialog({ onClose, onCreate, profiles }) {
  const [mode, setMode] = React.useState('recruitee');
  const [picked, setPicked] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [desc, setDesc] = React.useState('');
  const [liveRecruiteeJobs, setLiveRecruiteeJobs] = React.useState(null);

  React.useEffect(() => {
    if (mode !== 'recruitee') return;
    api.recruitee.jobs()
      .then(setLiveRecruiteeJobs)
      .catch(() => setLiveRecruiteeJobs([]));
  }, [mode]);

  const recruiteeRefsInCaliper = React.useMemo(
    () => new Set((profiles ?? PROFILES).filter((p) => p.source === 'recruitee' && p.sourceRef).map((p) => p.sourceRef)),
    [profiles],
  );
  const allRecruiteeJobs = liveRecruiteeJobs ?? RECRUITEE_JOBS;
  const recruiteeChoices = React.useMemo(
    () => allRecruiteeJobs.filter((j) => !recruiteeRefsInCaliper.has(j.id)),
    [allRecruiteeJobs, recruiteeRefsInCaliper],
  );

  React.useEffect(() => {
    if (mode !== 'recruitee') return;
    if (picked && recruiteeRefsInCaliper.has(picked)) setPicked('');
  }, [mode, picked, recruiteeRefsInCaliper]);

  const canSubmitRecruitee = Boolean(picked && recruiteeChoices.some((j) => j.id === picked));
  const canSubmitManual = title.trim().length > 0 && desc.trim().length > 0;
  const canSubmit = mode === 'recruitee' ? canSubmitRecruitee : canSubmitManual;

  const submit = () => {
    if (!onCreate || !canSubmit) return;
    if (mode === 'recruitee') {
      const job = allRecruiteeJobs.find((j) => j.id === picked);
      if (!job || recruiteeRefsInCaliper.has(job.id)) return;
      onCreate(buildProfileFromRecruiteeJob(job));
      return;
    }
    onCreate(buildManualProfile(title, desc));
  };

  return (
    <div className="detail" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
           style={{
             width: 'min(640px, 92vw)',
             alignSelf: 'center',
             background: 'var(--surface)',
             border: '1px solid var(--line)',
             borderRadius: 'var(--radius-lg)',
             margin: 'auto',
             boxShadow: 'var(--shadow-pop)',
             maxHeight: '88vh',
             display: 'flex', flexDirection: 'column',
           }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 500, letterSpacing: '-0.005em' }}>
            New job
          </h3>
          <div className="spacer"/>
          <IconBtn name="x" size={14} onClick={onClose}/>
        </div>
        <div style={{ padding: 22, overflowY: 'auto' }}>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
            Each job is one open role. Pull from your Recruitee career portal, or add one manually for internal-only postings.
          </div>
          <Segmented value={mode} onChange={setMode} options={[
            { value: 'recruitee', label: 'Fetch from Recruitee' },
            { value: 'manual',    label: 'Add manually' },
          ]}/>

          {mode === 'recruitee' ? (
            <div className="col" style={{ marginTop: 18, gap: 12 }}>
              <Field label="Open positions" hint="Jobs already in Caliper are hidden.">
                <select className="sel" value={picked} onChange={(e) => setPicked(e.target.value)}>
                  <option value="">
                    {recruiteeChoices.length ? 'Select a position to import…' : 'No new positions — all listed roles are already in Caliper'}
                  </option>
                  {recruiteeChoices.map((j) =>
                    <option key={j.id} value={j.id}>{j.title} — {j.dept ?? 'General'} ({j.applicants_count ?? j.apps ?? 0} applicants)</option>
                  )}
                </select>
              </Field>
              {picked && (
                <div className="callout">
                  Title and description will be imported from Recruitee. Add criteria on the job&apos;s <strong>Criteria</strong> tab after creating it.
                </div>
              )}
            </div>
          ) : (
            <div className="col" style={{ marginTop: 18, gap: 14 }}>
              <Field label="Job title">
                <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)}
                       placeholder="e.g. Senior Talent Partner, EMEA"/>
              </Field>
              <Field label="Job description" hint="Paste the full text. Add criteria on this job's Criteria tab after it is created.">
                <textarea className="ta" rows={8} value={desc} onChange={(e) => setDesc(e.target.value)}
                          placeholder="What the role does, who it reports to, what the team looks like…"/>
              </Field>
            </div>
          )}
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between' }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" iconRight="chevron-right" disabled={!canSubmit} onClick={submit}>
            Create job &amp; add criteria
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── Job editor ─────────────────────────────────────────── */
function cloneCriteriaItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((x) => ({ ...x }));
}

function newCriterionId() {
  return `crit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildCriteriaPayload(mh, nh, rf) {
  return [
    ...mh.map((c) => ({ id: c.id, kind: 'must', name: c.name, weight: c.weight, biased: Boolean(c.biased) })),
    ...nh.map((c) => ({ id: c.id, kind: 'nice', name: c.name, weight: c.weight, biased: Boolean(c.biased) })),
    ...rf.map((c) => ({ id: c.id, kind: 'flag', name: c.name, weight: c.weight, biased: Boolean(c.biased) })),
  ];
}

function isRecruiteePlaceholderDescription(description) {
  const t = String(description || '').trim();
  if (!t) return true;
  if (!t.startsWith('Synced from Recruitee') && !t.startsWith('Imported from Recruitee')) {
    return false;
  }
  // Stub text from import/sync — not a real JD
  return t.length < 500 || !/\n{2,}/.test(t) && t.length < 900;
}

function isUsableJobDescription(description) {
  const t = String(description || '').trim();
  if (t.length < 80) return false;
  return !isRecruiteePlaceholderDescription(t);
}

function mapGeneratedCriteriaItems(items) {
  return (items || []).map((c) => ({
    id: newCriterionId(),
    name: c.name,
    weight: c.weight,
    biased: getBiasWarning(c.name),
  }));
}

function ProfileEditor({ profile: initialProfile, initialTab, onBack, go, onOpenRunSheet, canEdit = true }) {
  const { user } = useAuth();
  const userId = user?.sub ?? null;
  const isHero = initialProfile.id === HERO_PROFILE.id;
  const [profile, setProfile] = React.useState(initialProfile);
  const [detailRefreshing, setDetailRefreshing] = React.useState(false);

  React.useEffect(() => {
    if (initialProfile.source === 'recruitee' && initialProfile.sourceRef) {
      prefetchRecruiteeApplicants(initialProfile.sourceRef);
    }
  }, [initialProfile.id, initialProfile.source, initialProfile.sourceRef]);
  const [mh, setMHState] = React.useState(() => cloneCriteriaItems(initialProfile.mustHave));
  const [nh, setNHState] = React.useState(() => cloneCriteriaItems(initialProfile.niceToHave));
  const [rf, setRFState] = React.useState(() => cloneCriteriaItems(initialProfile.redFlags));
  const [desc, setDescState] = React.useState(() => initialProfile.description || '');
  const [showBias, setShowBias] = React.useState(false);
  const [workspaceSettings, setWorkspaceSettings] = React.useState(null);
  const [screeningModel, setScreeningModel] = React.useState(
    () => initialProfile.screeningModel || 'claude-sonnet-4-6',
  );
  const [shortlistStageId, setShortlistStageId] = React.useState(
    () => initialProfile.shortlistStageId ?? '',
  );
  const [shortlistStageName, setShortlistStageName] = React.useState(
    () => initialProfile.shortlistStageName ?? '',
  );
  const [saveState, setSaveState] = React.useState({ status: 'idle', message: '' });
  const criteriaDirtyRef = React.useRef(false);
  const generatingCriteriaRef = React.useRef(false);
  const lastAutoCriteriaFingerprintRef = React.useRef('');
  const totalCriteria = mh.length + nh.length + rf.length;
  const [criteriaGenState, setCriteriaGenState] = React.useState({ status: 'idle', message: '' });

  const markCriteriaDirty = React.useCallback(() => {
    criteriaDirtyRef.current = true;
  }, []);

  React.useEffect(() => {
    criteriaDirtyRef.current = false;
    generatingCriteriaRef.current = false;
    lastAutoCriteriaFingerprintRef.current = '';
    setCriteriaGenState({ status: 'idle', message: '' });
  }, [initialProfile.id]);

  const applyGeneratedCriteria = React.useCallback((data) => {
    const nextMh = mapGeneratedCriteriaItems(data.must_have);
    const nextNh = mapGeneratedCriteriaItems(data.nice_to_have);
    const nextRf = mapGeneratedCriteriaItems(data.red_flags);
    markCriteriaDirty();
    setMHState(nextMh);
    setNHState(nextNh);
    setRFState(nextRf);
    profile.mustHave = nextMh;
    profile.niceToHave = nextNh;
    profile.redFlags = nextRf;
  }, [profile, markCriteriaDirty]);

  const runGenerateCriteria = React.useCallback(async (mode = 'manual') => {
    if (isHero) return;
    if (!isUsableJobDescription(desc)) {
      const msg = isRecruiteePlaceholderDescription(desc)
        ? 'Job description is still the Recruitee placeholder. Open Overview, wait for sync, or paste the full JD, then try again.'
        : 'Paste the full job description on the Overview tab first (at least a short paragraph).';
      setCriteriaGenState({ status: 'error', message: msg });
      return;
    }
    if (mode === 'manual' && totalCriteria > 0) {
      const ok = window.confirm(
        'Replace current criteria with new AI-generated ones from the job description?',
      );
      if (!ok) return;
    }
    setCriteriaGenState({
      status: 'loading',
      message: mode === 'auto' ? 'Generating criteria from job description…' : 'Generating criteria…',
    });
    generatingCriteriaRef.current = true;
    try {
      const data = await api.jobs.generateCriteria(profile.id, {
        description: desc,
        model_id: screeningModel,
      });
      applyGeneratedCriteria(data);
      const count = data.must_have.length + data.nice_to_have.length + data.red_flags.length;
      const skipped =
        data.skipped_count > 0 ? ` ${data.skipped_count} line(s) skipped (policy).` : '';
      setCriteriaGenState({
        status: 'done',
        message: `Generated ${count} criteria.${skipped} Review and click Save.`,
      });
    } catch (err) {
      setCriteriaGenState({
        status: 'error',
        message: err?.message ?? 'Could not generate criteria.',
      });
    } finally {
      generatingCriteriaRef.current = false;
    }
  }, [
    isHero,
    desc,
    profile,
    screeningModel,
    totalCriteria,
    applyGeneratedCriteria,
  ]);

  React.useEffect(() => {
    if (isHero || detailRefreshing) return;
    if (totalCriteria > 0) return;
    if (!isUsableJobDescription(desc)) return;
    if (criteriaDirtyRef.current) return;
    if (generatingCriteriaRef.current) return;

    const fingerprint = `${profile.id}:${desc.length}`;
    if (lastAutoCriteriaFingerprintRef.current === fingerprint) return;
    lastAutoCriteriaFingerprintRef.current = fingerprint;

    runGenerateCriteria('auto');
  }, [profile.id, isHero, detailRefreshing, totalCriteria, desc, runGenerateCriteria]);

  React.useEffect(() => {
    setProfile(initialProfile);
    if (isHero || !String(initialProfile.id).startsWith('REC-')) {
      setDetailRefreshing(false);
      return;
    }

    let cancelled = false;
    setDetailRefreshing(true);
    const applyJob = (job: Record<string, unknown>) => {
      const shaped = shapeJobRow(job);
      setProfile(shaped);
      const nextDesc = shaped.description || '';
      setDescState((prev) => (prev === nextDesc ? prev : nextDesc));
      if (!generatingCriteriaRef.current && !criteriaDirtyRef.current) {
        setMHState(cloneCriteriaItems(shaped.mustHave));
        setNHState(cloneCriteriaItems(shaped.niceToHave));
        setRFState(cloneCriteriaItems(shaped.redFlags));
        setScreeningModel(shaped.screeningModel || 'claude-sonnet-4-6');
      }
    };

    const load = async () => {
      try {
        const job = await api.jobs.get(initialProfile.id);
        if (!cancelled) applyJob(job as unknown as Record<string, unknown>);
      } catch {
        if (!cancelled) setProfile(initialProfile);
      }

      try {
        const job = await api.jobs.refreshFromRecruitee(initialProfile.id);
        if (!cancelled) applyJob(job as unknown as Record<string, unknown>);
      } catch {
        // Keep list / GET data if Recruitee refresh fails.
      } finally {
        if (!cancelled) setDetailRefreshing(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [initialProfile.id, isHero]);

  React.useEffect(() => {
    api.settings.get().then(setWorkspaceSettings).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (profile.screeningModel) return;
    if (workspaceSettings?.default_model) {
      setScreeningModel(workspaceSettings.default_model);
    }
  }, [workspaceSettings, profile.screeningModel]);

  React.useLayoutEffect(() => {
    if (criteriaDirtyRef.current || generatingCriteriaRef.current) return;
    const mh0 = cloneCriteriaItems(profile.mustHave);
    const nh0 = cloneCriteriaItems(profile.niceToHave);
    const rf0 = cloneCriteriaItems(profile.redFlags);
    const d0 = profile.description || '';
    setMHState(mh0);
    setNHState(nh0);
    setRFState(rf0);
    setDescState(d0);
    setScreeningModel(profile.screeningModel || workspaceSettings?.default_model || 'claude-sonnet-4-6');
    setShortlistStageId(profile.shortlistStageId ?? '');
    setShortlistStageName(profile.shortlistStageName ?? '');
    setSaveState({ status: 'idle', message: '' });
  }, [profile, workspaceSettings?.default_model]);

  const saveProfile = React.useCallback(async () => {
    if (isHero) return;
    setSaveState({ status: 'saving', message: '' });
    try {
      const criteria = buildCriteriaPayload(mh, nh, rf);
      if (criteria.length === 0) {
        setSaveState({
          status: 'error',
          message: 'Add at least one criterion (click + Add), then save.',
        });
        return;
      }
      for (const c of criteria) {
        const blocked = getProtectedAttributeError(c.name);
        if (blocked) {
          setSaveState({ status: 'error', message: blocked });
          return;
        }
      }
      await api.jobs.upsert(profile.id, {
        name: profile.name,
        dept: profile.dept,
        status: profile.status,
        source: profile.source,
        source_ref: profile.sourceRef,
        description: desc,
        screening_model: screeningModel,
        shortlist_stage_id: shortlistStageId || null,
        shortlist_stage_name: shortlistStageName || null,
        criteria,
      });
      profile.screeningModel = screeningModel;
      profile.shortlistStageId = shortlistStageId || null;
      profile.shortlistStageName = shortlistStageName || null;
      profile.mustHave = mh;
      profile.niceToHave = nh;
      profile.redFlags = rf;
      profile.description = desc;
      criteriaDirtyRef.current = false;
      clearJobsCache(userId);
      setSaveState({ status: 'saved', message: 'Saved.' });
      setTimeout(() => setSaveState({ status: 'idle', message: '' }), 2500);
    } catch (err) {
      setSaveState({ status: 'error', message: err?.message ?? 'Save failed.' });
    }
  }, [isHero, profile, mh, nh, rf, desc, screeningModel, shortlistStageId, shortlistStageName]);

  const setMH = React.useCallback((up) => {
    markCriteriaDirty();
    setMHState((prev) => {
      const next = typeof up === 'function' ? up(prev) : up;
      profile.mustHave = next;
      return next;
    });
  }, [profile, markCriteriaDirty]);

  const setNH = React.useCallback((up) => {
    markCriteriaDirty();
    setNHState((prev) => {
      const next = typeof up === 'function' ? up(prev) : up;
      profile.niceToHave = next;
      return next;
    });
  }, [profile, markCriteriaDirty]);

  const setRF = React.useCallback((up) => {
    markCriteriaDirty();
    setRFState((prev) => {
      const next = typeof up === 'function' ? up(prev) : up;
      profile.redFlags = next;
      return next;
    });
  }, [profile, markCriteriaDirty]);

  const setDesc = React.useCallback((up) => {
    markCriteriaDirty();
    setDescState((prev) => {
      const next = typeof up === 'function' ? up(prev) : up;
      profile.description = next;
      return next;
    });
  }, [profile, markCriteriaDirty]);

  const fallbackRuns = [
    { id: '12052026', date: 'May 12, 2026', cvs: 38, scoreRange: [42, 91], status: 'completed', duration: '4m 12s', owner: 'You' },
    { id: '30042026', date: 'Apr 30, 2026', cvs: 24, scoreRange: [38, 87], status: 'completed', duration: '3m 04s', owner: 'Mara Achterberg' },
    { id: '18042026', date: 'Apr 18, 2026', cvs: 19, scoreRange: [45, 83], status: 'completed', duration: '2m 41s', owner: 'You' },
  ];
  const runsToShow = isHero
    ? fallbackRuns
    : runsForDisplay(profile.screeningRuns ?? []);

  const subtitleParts = [
    profile.dept || null,
    profile.postedOn ? `posted ${profile.postedOn}` : null,
    `${profile.runsCount || 0} screening ${profile.runsCount === 1 ? 'run' : 'runs'}`,
    profile.lastUpdated ? `last updated ${profile.lastUpdated}` : null,
  ].filter(Boolean);

  const jobTitle = profile.name?.trim() || 'Untitled job';

  return (
    <div className="page job-detail-page">
      <header className="job-detail-hero">
        <button type="button" className="job-detail-back" onClick={onBack}>
          <Icon name="chevron-left" size={16} aria-hidden />
          Jobs
        </button>

        <div className="job-detail-hero__main">
          <div className="job-detail-hero__text">
            <h1 className="job-detail-hero__title">{jobTitle}</h1>
            {subtitleParts.length > 0 && (
              <p className="job-detail-hero__sub">{subtitleParts.join(' · ')}</p>
            )}
            <div className="job-detail-hero__badges">
              {profile.source === 'recruitee'
                ? <Badge tone="info"><Icon name="database" size={11} aria-hidden /> Recruitee · {profile.sourceRef}</Badge>
                : <Badge tone="ghost"><Icon name="edit" size={11} aria-hidden /> Manually added</Badge>}
              <Badge tone={profile.status === 'open' ? 'ok' : 'ghost'} dot={profile.status === 'open'}>
                {profile.status === 'open' ? 'Open' : profile.status === 'closed' ? 'Closed' : 'Archived'}
              </Badge>
              <span className="job-detail-hero__id mono muted" title={profile.id}>{profile.id}</span>
            </div>
          </div>
          <div className="job-detail-hero__actions">
            <RunScreeningBtn canEdit={canEdit} onClick={() => onOpenRunSheet && onOpenRunSheet()} />
          </div>
        </div>
      </header>

      <ProfileTabs
        key={profile.id}
        profile={profile}
        canEdit={canEdit}
        initialTab={initialTab}
        desc={desc} setDesc={setDesc}
        mh={mh} setMH={setMH}
        nh={nh} setNH={setNH}
        rf={rf} setRF={setRF}
        runsToShow={runsToShow}
        showBias={showBias} setShowBias={setShowBias}
        totalCriteria={totalCriteria}
        workspaceSettings={workspaceSettings}
        screeningModel={screeningModel}
        setScreeningModel={(v) => { markCriteriaDirty(); setScreeningModel(v); }}
        shortlistStageId={shortlistStageId}
        setShortlistStageId={setShortlistStageId}
        shortlistStageName={shortlistStageName}
        setShortlistStageName={setShortlistStageName}
        markCriteriaDirty={markCriteriaDirty}
        onSaveProfile={saveProfile}
        saveState={saveState}
        isHero={isHero}
        go={go}
        onOpenRunSheet={onOpenRunSheet}
        criteriaGenState={criteriaGenState}
        onGenerateCriteria={() => {
          lastAutoCriteriaFingerprintRef.current = '';
          runGenerateCriteria('manual');
        }}
      />
    </div>
  );
}

function resolveProfileTab(initialTab) {
  if (initialTab === 'criteria') return 'criteria';
  if (['overview', 'runs', 'candidates', 'related', 'audit'].includes(initialTab)) return initialTab;
  return 'overview';
}

function ProfileTabs({
  profile, initialTab, desc, setDesc, mh, setMH, nh, setNH, rf, setRF,
  runsToShow, showBias, setShowBias, totalCriteria,
  workspaceSettings, screeningModel, setScreeningModel,
  shortlistStageId, setShortlistStageId, shortlistStageName, setShortlistStageName,
  markCriteriaDirty,
  onSaveProfile, saveState, isHero,
  go, onOpenRunSheet, criteriaGenState, onGenerateCriteria, canEdit = true,
}) {
  const [tab, setTab] = React.useState(() => {
    const resolved = resolveProfileTab(initialTab);
    return !canEdit && resolved === 'related' ? 'overview' : resolved;
  });
  const [calibration, setCalibration] = React.useState(null);

  React.useEffect(() => {
    if (!canEdit && tab === 'related') {
      setTab('overview');
    }
  }, [canEdit, tab]);

  React.useLayoutEffect(() => {
    const resolved = resolveProfileTab(initialTab);
    setTab(!canEdit && resolved === 'related' ? 'overview' : resolved);
  }, [profile.id, initialTab, canEdit]);

  React.useEffect(() => {
    if (tab !== 'criteria' || isHero) {
      setCalibration(null);
      return;
    }
    let cancelled = false;
    api.jobs.calibration(profile.id)
      .then((data) => { if (!cancelled) setCalibration(data); })
      .catch(() => { if (!cancelled) setCalibration(null); });
    return () => { cancelled = true; };
  }, [tab, profile.id, isHero]);

  const calibrationByCriterionId = React.useMemo(() => {
    const map = new Map();
    for (const item of calibration?.flagged ?? []) {
      map.set(item.criterion_id, item);
    }
    return map;
  }, [calibration]);

  const completedRunsForJob = React.useMemo(
    () => (profile.screeningRuns ?? []).filter((r) => r.status === 'completed'),
    [profile.screeningRuns],
  );
  const completedRunCount = completedRunsForJob.length;

  const [scoredRows, setScoredRows] = React.useState([]);
  const [scoredLoading, setScoredLoading] = React.useState(false);
  const [scoredError, setScoredError] = React.useState(null);
  const [dispositionByApplicantId, setDispositionByApplicantId] = React.useState(() => new Map());

  React.useEffect(() => {
    if (isHero || !profile?.id) {
      setScoredRows([]);
      setScoredLoading(false);
      setScoredError(null);
      setDispositionByApplicantId(new Map());
      return;
    }

    let cancelled = false;
    setScoredLoading(true);
    setScoredError(null);

    api.jobs.scoredCandidates(profile.id)
      .then(({ candidates }) => {
        if (cancelled) return;
        const dispositionMap = new Map();
        for (const c of candidates) {
          if (!c.recruitee_applicant_id || !c.disposition) continue;
          const key = String(c.recruitee_applicant_id);
          if (!dispositionMap.has(key)) {
            dispositionMap.set(key, {
              disposition: c.disposition,
              target_stage_name: c.target_stage_name,
              recruitee_sync_status: c.recruitee_sync_status,
            });
          }
        }
        setDispositionByApplicantId(dispositionMap);
        setScoredRows(
          candidates.map((c) => ({
            key: `${c.run_id}-${c.id}`,
            candidateId: c.id,
            name: c.name ?? 'Unknown',
            title: c.title ?? '—',
            loc: c.location ?? '—',
            score: c.score ?? '—',
            status: c.status ?? 'review',
            confidence: c.confidence ?? 'medium',
            runId: c.run_id,
            runDate: formatJobDate(c.run_created_at) ?? '—',
            disposition: c.disposition,
          })),
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setScoredRows([]);
          setScoredError(err?.message ?? 'Failed to load scored candidates.');
        }
      })
      .finally(() => {
        if (!cancelled) setScoredLoading(false);
      });

    return () => { cancelled = true; };
  }, [profile.id, isHero, completedRunCount]);

  const candidateRows = isHero
    ? (typeof getCandidateRowsForJob === 'function' ? getCandidateRowsForJob(profile.id) : [])
    : scoredRows;

  const initialApplicants = React.useMemo(
    () => (profile.sourceRef ? getCachedApplicants(profile.sourceRef) : null),
    [profile.sourceRef],
  );
  const [recruiteeData, setRecruiteeData] = React.useState(() => initialApplicants ?? null);
  const [recruiteeAppsLoading, setRecruiteeAppsLoading] = React.useState(
    () =>
      profile.source === 'recruitee'
      && Boolean(profile.sourceRef)
      && !(initialApplicants?.applicants?.length),
  );
  const [recruiteeAppsError, setRecruiteeAppsError] = React.useState(null);
  const [auditCount, setAuditCount] = React.useState(0);
  const [relatedCount, setRelatedCount] = React.useState(0);

  React.useEffect(() => {
    if (!canEdit || !profile?.id || profile.id === HERO_PROFILE.id) {
      setRelatedCount(0);
      return;
    }
    api.jobs.relatedProfiles(profile.id)
      .then((rows) => setRelatedCount(rows.length))
      .catch(() => setRelatedCount(0));
  }, [profile.id, canEdit]);

  React.useEffect(() => {
    if (profile.source !== 'recruitee' || !profile.sourceRef) {
      setRecruiteeData(null);
      setRecruiteeAppsLoading(false);
      setRecruiteeAppsError(null);
      return;
    }

    let cancelled = false;
    const cached = getCachedApplicants(profile.sourceRef);
    if (cached?.applicants) {
      setRecruiteeData(cached);
      setRecruiteeAppsLoading(false);
      setRecruiteeAppsError(null);
    } else {
      setRecruiteeAppsLoading(true);
      setRecruiteeAppsError(null);
    }

    loadRecruiteeApplicants(profile.sourceRef)
      .then((data) => {
        if (!cancelled) {
          setRecruiteeData(data);
          setRecruiteeAppsError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setRecruiteeData(null);
          setRecruiteeAppsError(err?.message ?? 'Failed to load applicants from Recruitee.');
        }
      })
      .finally(() => {
        if (!cancelled) setRecruiteeAppsLoading(false);
      });

    return () => { cancelled = true; };
  }, [profile.id, profile.sourceRef, profile.source]);

  const recruiteeApps = recruiteeData?.applicants ?? [];

  const candidatesTabCount = Math.max(
    candidateRows.length,
    recruiteeApps.length,
    profile.applicantsCount ?? 0,
    initialApplicants?.applicants?.length ?? 0,
  );

  return (
    <>
      <JobTabNav
        activeTab={tab}
        onTabChange={setTab}
        hiddenTabs={canEdit ? [] : ['related']}
        counts={{
          criteria: totalCriteria > 0 ? totalCriteria : null,
          runs: runsToShow.length > 0 ? runsToShow.length : null,
          candidates: candidatesTabCount > 0 ? candidatesTabCount : null,
          related: relatedCount > 0 ? relatedCount : null,
          audit: auditCount > 0 ? auditCount : null,
        }}
      />

      {tab === 'overview' && (
        <OverviewPane
          profile={profile}
          desc={desc}
          setDesc={setDesc}
          mh={mh}
          nh={nh}
          rf={rf}
          screeningModel={screeningModel}
          runsToShow={runsToShow}
          go={go}
          canEdit={canEdit}
          onGoToCriteria={() => setTab('criteria')}
        />
      )}
      {tab === 'criteria' && (
        <CriteriaPane
          profile={profile}
          mh={mh} setMH={setMH} nh={nh} setNH={setNH} rf={rf} setRF={setRF}
          showBias={showBias} setShowBias={setShowBias}
          workspaceSettings={workspaceSettings}
          screeningModel={screeningModel}
          setScreeningModel={setScreeningModel}
          shortlistStageId={shortlistStageId}
          setShortlistStageId={setShortlistStageId}
          shortlistStageName={shortlistStageName}
          setShortlistStageName={setShortlistStageName}
          onSave={onSaveProfile}
          saveState={saveState}
          isHero={isHero}
          canEdit={canEdit}
          criteriaGenState={criteriaGenState}
          onGenerateCriteria={onGenerateCriteria}
          hasUsableDescription={isUsableJobDescription(desc)}
          calibration={calibration}
          calibrationByCriterionId={calibrationByCriterionId}
          markCriteriaDirty={markCriteriaDirty}
        />
      )}
      {tab === 'runs'     && <RunsPane runs={runsToShow} go={go} onOpenRunSheet={onOpenRunSheet} canEdit={canEdit}/>}
      {tab === 'candidates' && (
        <JobCandidatesPane
          profile={profile}
          rows={candidateRows}
          recruiteeData={recruiteeData}
          recruiteeLoading={recruiteeAppsLoading}
          recruiteeError={recruiteeAppsError}
          scoredLoading={scoredLoading}
          scoredError={scoredError}
          completedRuns={completedRunsForJob}
          dispositionByApplicantId={dispositionByApplicantId}
          go={go}
          canEdit={canEdit}
          onOpenRunSheet={onOpenRunSheet}
        />
      )}
      {tab === 'audit' && (
        <AuditPane
          jobId={profile.id}
          isHero={isHero}
          active={tab === 'audit'}
          onCount={setAuditCount}
          go={go}
        />
      )}
      {canEdit && tab === 'related' && (
        <JobsPanel icon="search" title="Suggested talent" sub="Profiles discovered for this role based on the job description and criteria.">
          <RelatedProfilesPane
            jobId={profile.id}
            jobName={profile.name}
            hasDescription={Boolean(desc?.trim())}
            isHero={isHero}
            workspaceSettings={workspaceSettings}
            screeningModel={screeningModel}
          />
        </JobsPanel>
      )}
    </>
  );
}

function looksLikeHtml(text) {
  return typeof text === 'string' && /<[a-z][\s\S]*>/i.test(text);
}

/* ----- Overview pane ----- */
function OverviewPane({ profile, desc, setDesc, mh, nh, rf, screeningModel, runsToShow, go, onGoToCriteria, canEdit = true }) {
  return (
    <div className="overview-pane-grid">
      <div className="col" style={{ gap: 18 }}>
        <JobsPanel
          icon="doc"
          title="Job description"
          sub={profile.source === 'recruitee' ? `Synced from Recruitee · ${profile.sourceRef}` : 'Edit the description used for criteria generation.'}
        >
          {profile.source === 'recruitee' ? (
            looksLikeHtml(desc) ? (
              <div className="job-desc-html" dangerouslySetInnerHTML={{ __html: desc }} />
            ) : (
              <div className="job-desc-plain">{desc || 'No description available from Recruitee.'}</div>
            )
          ) : (
            <textarea className="ta job-desc-editor" rows={12} value={desc} onChange={(e) => setDesc(e.target.value)} />
          )}
        </JobsPanel>

        <JobsPanel
          icon="sliders"
          title="Criteria summary"
          actions={<Btn size="sm" variant="ghost" icon="edit" onClick={() => onGoToCriteria && onGoToCriteria()}>Edit criteria</Btn>}
        >
          <SummaryGroup kind="must" label="Must-have" items={mh} />
          <SummaryGroup kind="nice" label="Nice-to-have" items={nh} />
          <SummaryGroup kind="flag" label="Red flags" items={rf} />
          {mh.length + nh.length + rf.length === 0 && (
            <div className="callout">No criteria yet. Add them in the Criteria tab before starting a run.</div>
          )}
        </JobsPanel>
      </div>

      <div className="col" style={{ gap: 14 }}>
        <JobsPanel icon="history" title="Recent runs" sub="Latest screening runs for this job." flush>
          {runsToShow.length === 0 && (
            <p className="muted jobs-panel__inset" style={{ fontSize: 13, paddingTop: 4, paddingBottom: 4 }}>
              {canEdit
                ? <>No runs yet. Use <strong>Run screening</strong> above to screen CVs for this job.</>
                : 'No runs yet. Editors and admins can start screening runs for this job.'}
            </p>
          )}
          {runsToShow.map((r, i) => (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              className="overview-run-row"
              onClick={() => go && go('results', r.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  go && go('results', r.id);
                }
              }}
              style={{ borderTop: i ? '1px solid var(--line-soft)' : 'none' }}
            >
              <div className="mono muted overview-run-row__id">{r.id}</div>
              <div className="row" style={{ gap: 8, marginTop: 4 }}>
                <span className="mono tnum" style={{ fontSize: 13 }}>{r.date}</span>
                <span className="muted" style={{ fontSize: 13 }}>· {r.cvs} CVs</span>
              </div>
              {r.scoreRange && (
                <div className="row" style={{ marginTop: 6, gap: 6 }}>
                  <span className="mono tnum" style={{ fontSize: 12 }}>{r.scoreRange[0]}</span>
                  <span
                    className="overview-run-row__bar"
                    style={{
                      background: `linear-gradient(90deg, var(--bad) 0%, var(--warn) ${r.scoreRange[0]}%, var(--ok) ${r.scoreRange[1]}%, var(--line-soft) ${r.scoreRange[1]}%)`,
                    }}
                  />
                  <span className="mono tnum" style={{ fontSize: 12 }}>{r.scoreRange[1]}</span>
                </div>
              )}
            </div>
          ))}
        </JobsPanel>

        <JobsPanel icon="info" title="Quick facts">
            <div className="row" style={{ gap: 12, marginBottom: 10 }}>
              <span className="muted mono" style={{ fontSize: 11, width: 80 }}>Job title</span>
              <span style={{ fontSize: 12.5, fontWeight: 500 }}>{profile.name?.trim() || 'Untitled job'}</span>
            </div>
            <div className="row" style={{ gap: 12, marginBottom: 10 }}>
              <span className="muted mono" style={{ fontSize: 11, width: 80 }}>Posted</span>
              <span style={{ fontSize: 12.5 }}>{profile.postedOn ?? '—'}</span>
            </div>
            <div className="row" style={{ gap: 12, marginBottom: 10 }}>
              <span className="muted mono" style={{ fontSize: 11, width: 80 }}>Department</span>
              <span style={{ fontSize: 12.5 }}>{profile.dept || '—'}</span>
            </div>
            <div className="row" style={{ gap: 12, marginBottom: 10 }}>
              <span className="muted mono" style={{ fontSize: 11, width: 80 }}>Source</span>
              <span style={{ fontSize: 12.5 }}>
                {profile.source === 'recruitee' ? `Recruitee · ${profile.sourceRef}` : 'Manually added'}
              </span>
            </div>
            {screeningModel && (
              <div className="row" style={{ gap: 12, marginBottom: 10 }}>
                <span className="muted mono" style={{ fontSize: 11, width: 80 }}>Model</span>
                <span style={{ fontSize: 12.5 }}>{labelForModel(screeningModel)}</span>
              </div>
            )}
            <div className="row" style={{ gap: 12 }}>
              <span className="muted mono" style={{ fontSize: 11, width: 80 }}>Last edit</span>
              <span style={{ fontSize: 12.5 }}>{profile.lastUpdated ?? '—'}</span>
            </div>
            {profile.source === 'recruitee' && profile.applicantsCount != null && (
              <div className="row" style={{ gap: 12, marginTop: 10 }}>
                <span className="muted mono" style={{ fontSize: 11, width: 80 }}>Applicants</span>
                <span className="mono" style={{ fontSize: 12.5 }}>{profile.applicantsCount}</span>
              </div>
            )}
        </JobsPanel>
      </div>
    </div>
  );
}

const SummaryGroup = ({ kind, label, items }) => (
  <div style={{ marginBottom: 12 }}>
    <div className="eval-sec">
      <span>{label}</span>
      <span className="eval-sec__line"/>
      <span className="mono">{items.length}</span>
    </div>
    <div className="crit-chip-stack" style={{ marginBottom: 12 }}>
      {items.length === 0
        ? <span className="muted" style={{ fontSize: 12 }}>None yet</span>
        : items.map(it => <Chip key={it.id} kind={kind} name={it.name} weight={it.weight}/>)}
    </div>
  </div>
);

/* ----- Screening model picker ----- */
function ScreeningModelPicker({ modelId, onChange, settings }) {
  const provider = providerForModel(modelId);
  const providerModels = modelsForProvider(provider);
  const claudeReady = isProviderConfigured('claude', settings);
  const openaiReady = isProviderConfigured('openai', settings);

  const onProviderChange = (nextProvider) => {
    const next = firstConfiguredModel(nextProvider, settings)
      ?? modelsForProvider(nextProvider)[0]?.id;
    if (next) onChange(next);
  };

  return (
    <div className="card">
      <div className="card__head">
        <Icon name="sparkle" size={14} className="muted"/>
        <span className="card__title">Screening model</span>
      </div>
      <div className="card__body col" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label="Provider" style={{ flex: '1 1 180px', minWidth: 160 }}>
            <select
              className="sel"
              value={provider}
              onChange={(e) => onProviderChange(e.target.value)}
            >
              <option value="claude">{PROVIDER_LABELS.claude}</option>
              <option value="openai">{PROVIDER_LABELS.openai}</option>
            </select>
          </Field>
          <Field label="Model" style={{ flex: '2 1 220px', minWidth: 200 }}>
            <select
              className="sel"
              value={modelId}
              onChange={(e) => onChange(e.target.value)}
            >
              {providerModels.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
          Used when you <strong>Run screening</strong> on this job. API keys are configured in{' '}
          <strong>Settings → AI provider</strong>.
        </div>
        {provider === 'claude' && !claudeReady && (
          <div className="callout">Add an Anthropic API key in Settings to run screening with Claude.</div>
        )}
        {provider === 'openai' && !openaiReady && (
          <div className="callout">Add an OpenAI API key in Settings to run screening with OpenAI.</div>
        )}
        {settings?.default_model && settings.default_model !== modelId && (
          <div className="muted" style={{ fontSize: 11.5 }}>
            Workspace default: <span className="mono">{labelForModel(settings.default_model)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ----- Criteria pane ----- */
function CriteriaPane({
  profile,
  mh, setMH, nh, setNH, rf, setRF, showBias, setShowBias,
  workspaceSettings, screeningModel, setScreeningModel,
  shortlistStageId, setShortlistStageId, shortlistStageName, setShortlistStageName,
  onSave, saveState, isHero,
  criteriaGenState, onGenerateCriteria, hasUsableDescription, canEdit = true,
  calibration, calibrationByCriterionId, markCriteriaDirty,
}) {
  const [pipelineStages, setPipelineStages] = React.useState([]);
  const [stagesLoading, setStagesLoading] = React.useState(false);

  React.useEffect(() => {
    if (isHero || profile?.source !== 'recruitee' || !profile?.id) {
      setPipelineStages([]);
      return;
    }
    let cancelled = false;
    setStagesLoading(true);
    api.jobs.pipelineStages(profile.id)
      .then((res) => { if (!cancelled) setPipelineStages(res.stages ?? []); })
      .catch(() => { if (!cancelled) setPipelineStages([]); })
      .finally(() => { if (!cancelled) setStagesLoading(false); });
    return () => { cancelled = true; };
  }, [profile?.id, profile?.source, isHero]);

  const [biasPending, setBiasPending] = React.useState(null);
  const generating = criteriaGenState?.status === 'loading';
  const flagged = calibration?.flagged ?? [];
  const hasArchivedFlagged = flagged.some((item) => item.archived);

  const addBiasedCriterion = () => {
    if (!biasPending) return;
    const item = {
      id: newCriterionId(),
      name: biasPending.name,
      weight: biasPending.weight,
      biased: true,
    };
    if (biasPending.kind === 'must') setMH((prev) => [...prev, item]);
    else if (biasPending.kind === 'nice') setNH((prev) => [...prev, item]);
    else setRF((prev) => [...prev, item]);
    setBiasPending(null);
    setShowBias(false);
  };

  return (
    <div className="col" style={{ gap: 16 }}>
      {saveState?.message && saveState.status !== 'idle' && (
        <div
          className="jobs-save-banner"
          role="status"
          style={{ color: saveState.status === 'error' ? 'var(--bad)' : 'var(--ok-ink, green)' }}
        >
          {saveState.message}
        </div>
      )}
      {!isHero && (
        <div className="callout" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ flex: '1 1 220px', fontSize: 13 }}>
            {hasUsableDescription
              ? 'Criteria can be generated from the job description on the Overview tab. Open a job with no saved criteria to auto-generate.'
              : 'Paste the full job description on Overview, then generate criteria here.'}
            {criteriaGenState?.message && (
              <div
                style={{
                  marginTop: 6,
                  color:
                    criteriaGenState.status === 'error'
                      ? 'var(--bad)'
                      : criteriaGenState.status === 'loading'
                        ? 'var(--muted)'
                        : 'var(--ok-ink, green)',
                }}
              >
                {criteriaGenState.message}
              </div>
            )}
          </div>
          {canEdit && (
            <Btn
              variant="default"
              icon="sparkle"
              disabled={generating || !hasUsableDescription}
              onClick={() => onGenerateCriteria && onGenerateCriteria()}
            >
              {generating ? 'Generating…' : 'Generate from job description'}
            </Btn>
          )}
        </div>
      )}
      {flagged.length > 0 && (
        <div className="calibration-banner">
          <div className="calibration-banner__label mono">Calibration</div>
          <div className="calibration-banner__list">
            {flagged.map((item) => (
              <div key={item.criterion_id} className="calibration-banner__item">
                <strong>{item.criterion_name}</strong>
                <span className="muted"> — {item.message}</span>
              </div>
            ))}
          </div>
          {hasArchivedFlagged && (
            <div className="muted calibration-banner__foot">
              Some flagged criteria are archived but still have override history from past runs.
            </div>
          )}
        </div>
      )}
      <ScreeningModelPicker
        modelId={screeningModel}
        onChange={setScreeningModel}
        settings={workspaceSettings}
      />
      {!isHero && profile?.source === 'recruitee' && (
        <div className="card" style={{ padding: '14px 18px' }}>
          <div className="mono muted" style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            Recruitee push defaults
          </div>
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, marginBottom: 10 }}>
            Optional default stage when shortlisting with “Push to Recruitee” from screening results.
            Caliper still records who decided; Recruitee shows the platform integration account.
          </div>
          {stagesLoading ? (
            <div className="muted" style={{ fontSize: 12 }}>Loading pipeline stages…</div>
          ) : pipelineStages.length === 0 ? (
            <div className="muted" style={{ fontSize: 12 }}>No Recruitee pipeline stages available for this job.</div>
          ) : (
            <select
              className="sel"
              style={{ height: 34, minWidth: 240, fontSize: 13 }}
              value={shortlistStageId || ''}
              disabled={!canEdit}
              onChange={(e) => {
                markCriteriaDirty?.();
                const id = e.target.value;
                const stage = pipelineStages.find((s) => s.id === id);
                setShortlistStageId(id);
                setShortlistStageName(stage?.name ?? '');
              }}
            >
              <option value="">No default shortlist stage</option>
              {pipelineStages.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          {shortlistStageName && (
            <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
              Current default: <strong>{shortlistStageName}</strong>
            </div>
          )}
        </div>
      )}
      <CriteriaList kind="must" label="Must-have criteria"
        help="Missing or weak evidence applies a heavy score penalty. Quoted CV evidence counts fully; inferred matches count for less."
        items={mh} setItems={setMH} canEdit={canEdit}
        calibrationByCriterionId={calibrationByCriterionId}
        onBiasWarn={(payload) => { setBiasPending({ ...payload, kind: 'must' }); setShowBias(true); }}
        wrapPanelClass="jobs-panel--criteria-must" />
      <CriteriaList kind="nice" label="Nice-to-have"
        help="Boosts when matched with evidence. Doesn't penalise when missing."
        items={nh} setItems={setNH} canEdit={canEdit}
        calibrationByCriterionId={calibrationByCriterionId}
        onBiasWarn={(payload) => { setBiasPending({ ...payload, kind: 'nice' }); setShowBias(true); }}
        wrapPanelClass="jobs-panel--criteria-nice" />
      <CriteriaList kind="flag" label="Red flags"
        help="If matched, points are deducted (weight ×4 per flag, ×2 if inferred) and the candidate is marked Flagged."
        items={rf} setItems={setRF} canEdit={canEdit}
        calibrationByCriterionId={calibrationByCriterionId}
        onBiasWarn={(payload) => { setBiasPending({ ...payload, kind: 'flag' }); setShowBias(true); }}
        wrapPanelClass="jobs-panel--criteria-flag" />
      {showBias && (
        <div className="bias-banner">
          <Icon name="alert" size={16} className="bias-banner__icon"/>
          <div>
            <div className="bias-banner__title">This criterion may correlate with demographic bias.</div>
            <div className="bias-banner__body">
              Patterns like employment gaps, short tenures, or age-related wording are commonly associated with protected characteristics.
              If you add it anyway, it is saved with a bias flag on the audit trail.
              <div className="row" style={{ marginTop: 10, gap: 8 }}>
                <Btn size="sm" variant="default" onClick={addBiasedCriterion}>Add anyway (logged)</Btn>
                <Btn size="sm" variant="ghost" onClick={() => { setBiasPending(null); setShowBias(false); }}>Don&apos;t add</Btn>
              </div>
            </div>
          </div>
        </div>
      )}

      {!isHero && canEdit && (
        <div className="row" style={{ gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
          {saveState?.message && (
            <span
              style={{
                fontSize: 12.5,
                color: saveState.status === 'error' ? 'var(--bad)' : 'var(--ok-ink, green)',
              }}
            >
              {saveState.message}
            </span>
          )}
          <Btn
            variant="primary"
            icon="check"
            disabled={saveState?.status === 'saving'}
            onClick={() => onSave && onSave()}
          >
            {saveState?.status === 'saving' ? 'Saving…' : 'Save criteria & model'}
          </Btn>
        </div>
      )}

      {/* Weight explanation */}
      <div className="card">
        <div className="card__head">
          <Icon name="info" size={14} className="muted"/>
          <span className="card__title">How weights work</span>
        </div>
        <div className="card__body" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 32 }}>
          <div>
            <div style={{ marginBottom: 10, fontSize: 13, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
              Scoring uses a <strong>binary checklist</strong>: each line is Met or Not met.
              Your overall score is the <strong>% of must + nice criteria met</strong>, minus deductions for triggered red flags (weight ×4 each).
            </div>
            <div className="muted" style={{ fontSize: 12.5, maxWidth: '54ch' }}>
              Weights affect red-flag deductions only; checklist percentages count each line equally.
            </div>
          </div>
          <div className="col" style={{ gap: 4, minWidth: 200 }}>
            {[1, 2, 3, 4, 5].map(w => (
              <div key={w} className="row" style={{ gap: 8 }}>
                <span className="mono muted" style={{ width: 24, fontSize: 11 }}>×{w}</span>
                <span style={{
                  height: 6, borderRadius: 3,
                  background: 'var(--brand-primary)',
                  width: `${w * 16 + 30}px`,
                  opacity: 0.4 + w * 0.12,
                }}/>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----- Runs pane ----- */
function RunsPane({ runs, go, onOpenRunSheet, canEdit = true }) {
  const [runQuery, setRunQuery] = React.useState('');

  const filteredRuns = React.useMemo(() => {
    const q = runQuery.trim();
    if (!q) return runs;
    return runs.filter((r) =>
      matchesTextQuery(q, [
        r.id,
        r.date,
        r.owner,
        r.status,
        r.cvs != null ? String(r.cvs) : null,
        r.scoreRange ? `${r.scoreRange[0]}-${r.scoreRange[1]}` : null,
      ]),
    );
  }, [runs, runQuery]);

  if (runs.length === 0) {
    return (
      <JobsPanel icon="history" title="Screening runs" sub="Each run scores CVs against this job's criteria.">
        <PageEmpty
          icon="list"
          title="No screening runs yet"
          description={canEdit
            ? 'Start one to score CVs for this job.'
            : 'You can view completed runs here once an editor or admin starts screening for this job.'}
          actionLabel="Run screening"
          onAction={canEdit ? () => onOpenRunSheet && onOpenRunSheet() : undefined}
          actionDisabled={!canEdit}
        />
      </JobsPanel>
    );
  }
  return (
    <JobsPanel
      icon="history"
      title="Screening runs"
      sub={`${runs.length} run${runs.length === 1 ? '' : 's'} for this job`}
      flush
    >
      <div className="col" style={{ gap: 12 }}>
        <div className="jobs-toolbar__search" style={{ maxWidth: 320 }}>
          <Icon name="search" size={16} className="jobs-toolbar__search-icon" aria-hidden />
          <input
            className="inp"
            placeholder="Search runs by ID, owner, status…"
            value={runQuery}
            onChange={(e) => setRunQuery(e.target.value)}
            aria-label="Search runs"
          />
        </div>
        {runQuery.trim() && filteredRuns.length === 0 && (
          <p className="muted" style={{ fontSize: 13 }}>No runs match “{runQuery.trim()}”.</p>
        )}
        <div className="jobs-table-wrap">
          <table className="jobs-table">
        <thead>
          <tr>
            <th style={{ width: 140 }}>Run ID</th>
            <th style={{ width: 120 }}>Date</th>
            <th style={{ width: 80 }} className="col-right">CVs</th>
            <th>Score range</th>
            <th style={{ width: 100 }}>Duration</th>
            <th style={{ width: 100 }}>Owner</th>
            <th style={{ width: 120 }}>Status</th>
            <th style={{ width: 36 }}/>
          </tr>
        </thead>
        <tbody>
          {filteredRuns.map(r => (
            <tr key={r.id} className="is-clickable" onClick={() => go('results', r.id)}>
              <td className="col-num muted" style={{ fontSize: 11.5 }}>{r.id}</td>
              <td className="mono" style={{ fontSize: 11.5 }}>{r.date}</td>
              <td className="col-num col-right">{r.cvs}</td>
              <td>
                {r.scoreRange && (
                  <div className="row" style={{ gap: 8 }}>
                    <span className="mono tnum" style={{ fontSize: 12 }}>{r.scoreRange[0]}</span>
                    <span style={{
                      flex: 1, height: 4, borderRadius: 2,
                      background: `linear-gradient(90deg, var(--bad) 0%, var(--warn) ${r.scoreRange[0]}%, var(--ok) ${r.scoreRange[1]}%, var(--line-soft) ${r.scoreRange[1]}%)`,
                      minWidth: 80, maxWidth: 140,
                    }}/>
                    <span className="mono tnum" style={{ fontSize: 12 }}>{r.scoreRange[1]}</span>
                  </div>
                )}
              </td>
              <td className="mono" style={{ fontSize: 11.5 }}>{r.duration}</td>
              <td className="muted" style={{ fontSize: 12 }}>{r.owner}</td>
              <td><RunStatusBadge s={r.status}/></td>
              <td><Icon name="chevron-right" size={14} className="muted"/></td>
            </tr>
          ))}
        </tbody>
      </table>
        </div>
      </div>
    </JobsPanel>
  );
}

function RecruiteeCvModal({ candidateId, candidateName, onClose }) {
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="detail cv-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cv-preview-title"
      onClick={onClose}
    >
      <div
        className="cv-drawer__panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="detail__head">
          <div style={{ minWidth: 0 }}>
            <h2 id="cv-preview-title" className="cv-drawer__title">{candidateName}</h2>
            <p className="cv-drawer__sub muted">CV from Recruitee</p>
          </div>
          <IconBtn name="x" size={16} onClick={onClose} aria-label="Close" />
        </div>
        <div className="cv-drawer__body">
          <CvViewer
            candidateId={candidateId}
            candidateName={candidateName}
            cvSource="recruitee"
          />
        </div>
      </div>
    </div>
  );
}

/* ----- Recruitee applicants + screened candidates ----- */
function JobCandidatesPane({
  profile,
  rows,
  recruiteeData,
  recruiteeLoading,
  recruiteeError,
  scoredLoading = false,
  scoredError = null,
  completedRuns,
  dispositionByApplicantId,
  go,
  canEdit = true,
  onOpenRunSheet,
}) {
  const [cvPreview, setCvPreview] = React.useState(null);
  const [view, setView] = React.useState('board');
  const [pipelineView, setPipelineView] = React.useState('qualified');
  const [evalSort, setEvalSort] = React.useState<EvalSortMode>('default');
  const [applicantQuery, setApplicantQuery] = React.useState('');
  const [scoredQuery, setScoredQuery] = React.useState('');

  const recruiteeApps = recruiteeData?.applicants ?? [];
  const pipelineStages = recruiteeData?.pipeline?.stages ?? [];
  const qualifiedCount = recruiteeData?.qualified_count ?? recruiteeApps.filter((a) => !a.disqualified).length;
  const disqualifiedCount = recruiteeData?.disqualified_count ?? recruiteeApps.filter((a) => a.disqualified).length;

  const searchedApps = React.useMemo(() => {
    const q = applicantQuery.trim();
    if (!q) return recruiteeApps;
    return recruiteeApps.filter((a) =>
      matchesTextQuery(q, [a.name, a.email, a.location, a.stage_name]),
    );
  }, [recruiteeApps, applicantQuery]);

  const otherTabMatchCount = React.useMemo(() => {
    const q = applicantQuery.trim();
    if (!q) return 0;
    const otherQualified = pipelineView !== 'qualified';
    return recruiteeApps.filter((a) => {
      const inOtherTab = otherQualified ? !a.disqualified : a.disqualified;
      if (!inOtherTab) return false;
      return matchesTextQuery(q, [a.name, a.email, a.location, a.stage_name]);
    }).length;
  }, [applicantQuery, pipelineView, recruiteeApps]);

  const listColSpan = pipelineView === 'disqualified' ? 5 : 4;

  const listGroups = React.useMemo(
    () => buildPipelineListGroups(pipelineStages, searchedApps, pipelineView, evalSort),
    [pipelineStages, searchedApps, pipelineView, evalSort],
  );

  const uniquePeople = React.useMemo(() => {
    const s = new Set();
    rows.forEach((r) => s.add(r.name.toLowerCase()));
    return s.size;
  }, [rows]);

  const hasRecruitee = profile.source === 'recruitee' && profile.sourceRef;
  const hasScreened = completedRuns.length > 0 && (rows.length > 0 || scoredLoading || scoredError);
  const showRecruitee = hasRecruitee && (recruiteeLoading || recruiteeApps.length > 0);

  if (!showRecruitee && !hasScreened) {
    return (
      <JobsPanel icon="users" title="Applicants" sub="Recruitee pipeline and screened candidates for this job.">
        {recruiteeLoading ? (
          <div className="jobs-skeleton" role="status">Loading applicants from Recruitee…</div>
        ) : recruiteeError ? (
          <>
            <PageEmpty icon="users" title="Could not load applicants" description={recruiteeError} />
            {(profile.applicantsCount ?? 0) > 0 && (
              <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
                {recruiteeError === 'Forbidden'
                  ? `Recruitee reports ${profile.applicantsCount} applicants for this role — you may not have permission to view them.`
                  : `Recruitee reports ${profile.applicantsCount} applicants for this role — fix the connection and refresh.`}
              </p>
            )}
          </>
        ) : (
          <PageEmpty
            icon="users"
            title="No applicants yet"
            description="Applicants from Recruitee appear here. After screening, scored candidates show in a separate section."
            actionLabel="Run screening"
            onAction={canEdit ? () => onOpenRunSheet && onOpenRunSheet() : undefined}
            actionDisabled={!canEdit}
          />
        )}
      </JobsPanel>
    );
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      {showRecruitee && (
        <>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, flex: '1 1 300px', minWidth: 0 }}>
              {profile.applicantsCount != null && recruiteeApps.length > 0 && recruiteeApps.length < profile.applicantsCount
                ? (
                  <>
                    Showing <strong>{recruiteeApps.length}</strong> of{' '}
                    <strong>{profile.applicantsCount}</strong> applicants in Recruitee
                    {recruiteeLoading ? ' · loading…' : ' (first batch loaded for screening)'}
                    .
                  </>
                )
                : (
                  <>
                    <strong>{recruiteeApps.length || profile.applicantsCount || 0}</strong> applicant
                    {(recruiteeApps.length || profile.applicantsCount || 0) === 1 ? '' : 's'} in Recruitee
                    {recruiteeLoading && ' · loading…'}
                    .
                  </>
                )}
              {' '}
              {canEdit
                ? <>Screen a whole stage from its column, or <strong>Run screening</strong> for everyone.</>
                : 'Grouped by Recruitee pipeline stage.'}
            </div>
            <Segmented value={view} onChange={setView} options={[
              { value: 'board', label: 'Board' },
              { value: 'list', label: 'List' },
            ]}/>
          </div>

          <RecruiteePipelineTabs
            pipelineView={pipelineView}
            onPipelineViewChange={setPipelineView}
            qualifiedCount={qualifiedCount}
            disqualifiedCount={disqualifiedCount}
          />

          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 300, minWidth: 160 }}>
              <input
                className="inp"
                placeholder="Search applicants by name…"
                style={{ paddingLeft: 32 }}
                value={applicantQuery}
                onChange={(e) => setApplicantQuery(e.target.value)}
                aria-label="Search applicants"
              />
              <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--muted)' }}/>
            </div>
            <div className="row" style={{ alignItems: 'center', gap: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>Sort within each stage</span>
              <Segmented
                value={evalSort}
                onChange={setEvalSort}
                options={[
                  { value: 'default', label: 'Default' },
                  { value: 'eval_desc', label: 'Eval ↓' },
                  { value: 'eval_asc', label: 'Eval ↑' },
                ]}
              />
            </div>
          </div>

          {applicantQuery.trim() && (
            <div className="muted" style={{ fontSize: 12 }}>
              {searchedApps.length === 0
                ? (
                  <>
                    No applicants match “{applicantQuery.trim()}” on{' '}
                    {pipelineView === 'qualified' ? 'Qualified' : 'Disqualified'}.
                    {otherTabMatchCount > 0 && (
                      <>
                        {' '}
                        <button
                          type="button"
                          className="linkish"
                          style={{ font: 'inherit' }}
                          onClick={() => setPipelineView(pipelineView === 'qualified' ? 'disqualified' : 'qualified')}
                        >
                          {otherTabMatchCount} match{otherTabMatchCount === 1 ? '' : 'es'} on{' '}
                          {pipelineView === 'qualified' ? 'Disqualified' : 'Qualified'} — switch tab
                        </button>
                      </>
                    )}
                  </>
                )
                : (
                  <>
                    <strong>{searchedApps.length}</strong> applicant{searchedApps.length === 1 ? '' : 's'} match “{applicantQuery.trim()}”.
                  </>
                )}
            </div>
          )}

          {recruiteeLoading && recruiteeApps.length === 0 ? (
            <div className="card">
              <div className="muted" style={{ padding: 20, fontSize: 12.5 }}>Loading applicants…</div>
            </div>
          ) : view === 'board' ? (
            <RecruiteePipelineBoard
              stages={pipelineStages}
              applicants={searchedApps}
              pipelineView={pipelineView}
              sortMode={evalSort}
              hideEmptyColumns={Boolean(applicantQuery.trim())}
              canEdit={canEdit}
              dispositionByApplicantId={dispositionByApplicantId}
              onView={(a) => setCvPreview({ id: a.id, name: a.name || 'Applicant' })}
              onScreenStage={(stage) => onOpenRunSheet && onOpenRunSheet(stage)}
            />
          ) : (
            <div className="card">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Applicant</th>
                    <th style={{ width: 160 }}>Location</th>
                    <th style={{ width: 88 }}>Evaluation</th>
                    {pipelineView === 'disqualified' && <th style={{ width: 200 }}>Reason</th>}
                    <th style={{ width: 100 }}>CV</th>
                  </tr>
                </thead>
                <tbody>
                  {listGroups.map(({ stage, items }) => (
                    <React.Fragment key={stage.id}>
                      <tr className="tbl-group">
                        <td colSpan={listColSpan}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span className="tbl-group__label">
                              <span
                                className="tbl-group__dot"
                                data-category={(stage.category || 'other').toLowerCase()}
                              />
                              {stage.name}
                            </span>
                            <span className="tbl-group__count">
                              {items.length} {items.length === 1 ? 'candidate' : 'candidates'}
                            </span>
                            {onOpenRunSheet && pipelineView === 'qualified' && items.length > 0 && (
                              canEdit ? (
                                <Btn
                                  size="sm"
                                  variant="ghost"
                                  icon="play"
                                  style={{ marginLeft: 'auto' }}
                                  onClick={() => onOpenRunSheet(stage.name)}
                                >
                                  Screen stage
                                </Btn>
                              ) : (
                                <span className="run-screening-locked run-screening-locked--inline" title="View-only access — editors and admins can run screenings">
                                  <Btn
                                    size="sm"
                                    variant="ghost"
                                    icon="lock"
                                    disabled
                                    tabIndex={-1}
                                    aria-disabled="true"
                                    style={{ marginLeft: 'auto' }}
                                    aria-label="Screen stage (view-only)"
                                  >
                                    Screen stage
                                  </Btn>
                                </span>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                      {items.length === 0 ? (
                        <tr>
                          <td colSpan={listColSpan} className="muted" style={{ fontSize: 12.5, padding: '10px 14px' }}>
                            No applicants
                          </td>
                        </tr>
                      ) : (
                        items.map((a) => (
                          <tr key={a.id}>
                            <td>
                              <div style={{ fontWeight: 500, fontSize: 13.5 }}>{a.name || 'Unknown'}</div>
                            </td>
                            <td className="muted">{a.location || '—'}</td>
                            <td>
                              <RecruiteeEvalBadge score={a.evaluation_score} inline />
                            </td>
                            {pipelineView === 'disqualified' && (
                              <td>
                                {a.disqualify_reason ? (
                                  <span className="cand-card__disqualify cand-card__disqualify--inline">
                                    {a.disqualify_reason}
                                  </span>
                                ) : (
                                  <span className="muted">—</span>
                                )}
                              </td>
                            )}
                            <td onClick={(e) => e.stopPropagation()}>
                              <Btn
                                size="sm"
                                variant="ghost"
                                icon="eye"
                                onClick={() => setCvPreview({ id: a.id, name: a.name || 'Applicant' })}
                              >
                                View
                              </Btn>
                            </td>
                          </tr>
                        ))
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {cvPreview && (
        <RecruiteeCvModal
          candidateId={cvPreview.id}
          candidateName={cvPreview.name}
          onClose={() => setCvPreview(null)}
        />
      )}

      {hasScreened && (
        <>
          {scoredError && (
            <div className="callout" style={{ fontSize: 12.5 }}>
              {scoredError}
            </div>
          )}
          {scoredLoading && (
            <div className="muted" style={{ fontSize: 12.5 }}>Loading screened candidates…</div>
          )}
          {!scoredLoading && rows.length > 0 && (
          <>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, flex: '1 1 300px' }}>
              <strong>{rows.length}</strong> scored candidate row{rows.length === 1 ? '' : 's'} across{' '}
              <strong>{completedRuns.length}</strong> completed run{completedRuns.length === 1 ? '' : 's'}
              {uniquePeople > 0 && (
                <>
                  {' · '}
                  <span className="mono">{uniquePeople}</span> distinct names
                </>
              )}
              . Click a row to open candidate details.
            </div>
            <div style={{ position: 'relative', flex: '0 1 260px', minWidth: 160 }}>
              <input
                className="inp"
                placeholder="Search screened candidates…"
                style={{ paddingLeft: 32, width: '100%' }}
                value={scoredQuery}
                onChange={(e) => setScoredQuery(e.target.value)}
                aria-label="Search screened candidates"
              />
              <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--muted)' }}/>
            </div>
          </div>

          <div className="card">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th style={{ width: 120 }}>Location</th>
                  <th style={{ width: 72 }} className="col-right">Score</th>
                  <th style={{ width: 100 }}>Confidence</th>
                  <th style={{ width: 130 }}>Status</th>
                  <th style={{ width: 140 }}>Run</th>
                  <th style={{ width: 110 }}>Date</th>
                  <th style={{ width: 36 }}/>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((row) =>
                    matchesTextQuery(scoredQuery, [
                      row.name,
                      row.title,
                      row.loc,
                      row.runId,
                      row.score != null ? String(row.score) : null,
                      row.status,
                    ]),
                  )
                  .map((row) => (
                  <tr
                    key={row.key}
                    className="is-clickable"
                    tabIndex={0}
                    role="button"
                    onClick={() => {
                      if (go && row.candidateId) {
                        go('results', { run: row.runId, candidate: row.candidateId });
                      } else if (go) {
                        go('results', row.runId);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (go && row.candidateId) {
                          go('results', { run: row.runId, candidate: row.candidateId });
                        } else if (go) {
                          go('results', row.runId);
                        }
                      }
                    }}
                    aria-label={
                      row.candidateId
                        ? `Open candidate ${row.name} in ${row.runId}`
                        : `Open run ${row.runId}`
                    }
                  >
                    <td>
                      <div style={{ fontWeight: 500, fontSize: 13.5 }}>{row.name}</div>
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>{row.title}</div>
                    </td>
                    <td className="muted">{row.loc}</td>
                    <td className="col-num col-right mono" style={{ fontSize: 12.5 }}>{row.score}</td>
                    <td><Confidence level={row.confidence}/></td>
                    <td><StatusBadge s={row.status}/></td>
                    <td className="mono muted" style={{ fontSize: 11.5 }}>{row.runId}</td>
                    <td className="mono" style={{ fontSize: 11.5 }}>{row.runDate}</td>
                    <td><Icon name="chevron-right" size={14} className="muted"/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
          )}
        </>
      )}
    </div>
  );
}

const AUDIT_KIND_META = {
  criteria: { icon: 'sliders', label: 'Criteria' },
  run: { icon: 'play', label: 'Screening' },
  override: { icon: 'edit', label: 'Override' },
  candidate: { icon: 'users', label: 'Candidate' },
  job: { icon: 'doc', label: 'Job' },
  sync: { icon: 'database', label: 'Recruitee' },
  other: { icon: 'history', label: 'Activity' },
};

/* ----- Audit pane ----- */
function AuditPane({ jobId, isHero, active, onCount, go }) {
  const [entries, setEntries] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const loadAudit = React.useCallback(() => {
    if (isHero || !jobId) {
      setEntries([]);
      onCount?.(0);
      setLoading(false);
      return () => {};
    }

    let cancelled = false;
    setLoading(true);
    api.jobs
      .audit(jobId)
      .then((rows) => {
        if (cancelled) return;
        setEntries(rows);
        onCount?.(rows.length);
      })
      .catch(() => {
        if (cancelled) return;
        setEntries([]);
        onCount?.(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [jobId, isHero, onCount]);

  React.useEffect(() => {
    if (!active) return undefined;
    return loadAudit();
  }, [active, loadAudit]);

  return (
    <JobsPanel
      icon="list"
      title="Activity log"
      sub={loading ? 'Loading…' : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}
      actions={!loading && entries.length > 0 ? <Btn size="sm" variant="ghost" onClick={loadAudit}>Refresh</Btn> : null}
      flush
    >
        {loading && (
          <div className="jobs-skeleton" role="status">Loading activity…</div>
        )}
        {!loading && entries.length === 0 && (
          <PageEmpty
            icon="history"
            title="No activity yet"
            description="Saving criteria, running screening, and overriding scores on this job are recorded here automatically."
          />
        )}
        {!loading && entries.length > 0 && (
          <div className="log">
            {entries.map((a) => {
              const meta = AUDIT_KIND_META[a.kind] ?? AUDIT_KIND_META.other;
              return (
                <div key={a.id} className={`log__row log__row--${a.kind}`}>
                  <div className="log__ts">{a.ts}</div>
                  <div className="log__main">
                    <div className="log__kind">
                      <Icon name={meta.icon} size={12} className="muted"/>
                      <span>{meta.label}</span>
                    </div>
                    <div className="log__msg">
                      <b>{a.who}</b> {a.msg}
                      {a.warned && (
                        <Badge tone="warn" style={{ marginLeft: 8, verticalAlign: 'middle' }}>
                          Bias criteria
                        </Badge>
                      )}
                    </div>
                    {a.reason !== '—' && (
                      <div className="log__reason muted">Reason: {a.reason}</div>
                    )}
                    {a.runId && go && (a.kind === 'run' || a.kind === 'override') && (
                      <button
                        type="button"
                        className="linkish log__link"
                        onClick={() => go('results', a.runId)}
                      >
                        View run →
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </JobsPanel>
  );
}

/* ----- Criteria list (shared) ----- */
function CriteriaList({ kind, label, help, items, setItems, onBiasWarn, canEdit = true, calibrationByCriterionId, wrapPanelClass = '' }) {
  const [input, setInput] = React.useState('');
  const [weight, setWeight] = React.useState(kind === 'must' ? 5 : 3);
  const [inputError, setInputError] = React.useState('');
  const [renameErrors, setRenameErrors] = React.useState({});
  const focusNamesRef = React.useRef({});

  const draftText = input.trim();
  const hasDraft = draftText.length > 0;

  const add = () => {
    const name = input.trim();
    if (!name) return;
    const blocked = getProtectedAttributeError(name);
    if (blocked) {
      setInputError(blocked);
      return;
    }
    setInputError('');
    if (getBiasWarning(name) && onBiasWarn) {
      onBiasWarn({ name, weight });
      setInput('');
      return;
    }
    setItems([...items, { id: newCriterionId(), name, weight }]);
    setInput('');
  };
  const remove = (id) => setItems(items.filter(x => x.id !== id));
  const setWeightFor = (id, w) => setItems(items.map(x => x.id === id ? { ...x, weight: w } : x));
  const renameItem = (id, name) => {
    setRenameErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setItems(items.map(x => x.id === id ? { ...x, name } : x));
  };
  const commitRename = (id, rawName) => {
    const trimmed = rawName.trim();
    const fallback = focusNamesRef.current[id] ?? items.find(x => x.id === id)?.name ?? '';
    if (!trimmed) {
      renameItem(id, fallback);
      return;
    }
    const blocked = getProtectedAttributeError(trimmed);
    if (blocked) {
      setRenameErrors((prev) => ({ ...prev, [id]: blocked }));
      renameItem(id, fallback);
      return;
    }
    const biased = getBiasWarning(trimmed);
    setItems(items.map(x => x.id === id ? { ...x, name: trimmed, ...(biased ? { biased: true } : {}) } : x));
  };

  return (
    <JobsPanel flush className={wrapPanelClass}>
      <div className="crit-list">
      {canEdit && hasDraft && (
        <div className="callout" style={{ marginBottom: 10, fontSize: 12.5 }}>
          You have unsaved text in the box below. Click <strong>+ Add</strong>, then{' '}
          <strong>Save criteria &amp; model</strong> — typing alone does not add a criterion.
        </div>
      )}
      <div className="crit-list__hd">
        <div className="crit-list__title">
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: kind === 'must' ? 'var(--ok)' : kind === 'nice' ? 'var(--warn)' : 'var(--bad)',
          }}/>
          {label}
        </div>
        <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>· {help}</span>
        <span className="crit-list__count">{items.length} criteria</span>
      </div>
      <div className="crit-list__body">
        <div className="crit-list__chips">
          {items.length === 0
            ? <span className="muted" style={{ fontSize: 12, padding: '6px 2px' }}>No criteria yet — add one below.</span>
            : items.map(it => (
              <React.Fragment key={it.id}>
                <span className={`chip chip--${kind}`}>
                  {canEdit ? (
                    <input
                      className="chip__crit-name chip__crit-name--input"
                      value={it.name}
                      aria-label={`Edit criterion: ${it.name}`}
                      onFocus={() => { focusNamesRef.current[it.id] = it.name; }}
                      onChange={(e) => renameItem(it.id, e.target.value)}
                      onBlur={(e) => commitRename(it.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    />
                  ) : (
                    <span className="chip__crit-name">{it.name}</span>
                  )}
                  {renameErrors[it.id] && (
                    <span style={{ flex: '1 1 100%', fontSize: 11, color: 'var(--bad)', lineHeight: 1.35 }}>
                      {renameErrors[it.id]}
                    </span>
                  )}
                  <span className="chip__crit-actions">
                    <WeightStepper value={it.weight} onChange={(w) => setWeightFor(it.id, w)} disabled={!canEdit}/>
                    {canEdit && (
                      <button type="button" className="chip__x" onClick={() => remove(it.id)} aria-label={`Remove ${it.name}`}><Icon name="x" size={10} stroke={2}/></button>
                    )}
                  </span>
                </span>
                {calibrationByCriterionId?.get(it.id) && (
                  <span className="calibration-chip-hint">
                    {Math.round(calibrationByCriterionId.get(it.id).override_rate * 100)}% override rate · consider rewording
                  </span>
                )}
              </React.Fragment>
            ))}
        </div>
        {canEdit && (
          <>
            <div className="crit-list__add">
              <input className="inp" placeholder={`Add a ${kind === 'must' ? 'must-have' : kind === 'nice' ? 'nice-to-have' : 'red flag'} criterion…`}
                     value={input}
                     onChange={(e) => { setInput(e.target.value); if (inputError) setInputError(''); }}
                     onKeyDown={(e) => e.key === 'Enter' && add()}
                     style={{ flex: 1 }}/>
              <div className="row" style={{ gap: 4 }}>
                <span className="mono muted" style={{ fontSize: 11 }}>weight</span>
                <WeightStepper value={weight} onChange={setWeight}/>
              </div>
              <Btn icon="plus" onClick={add}>Add</Btn>
            </div>
            {inputError && (
              <p style={{ fontSize: 12, color: 'var(--bad)', margin: '8px 0 0' }}>{inputError}</p>
            )}
          </>
        )}
      </div>
    </div>
    </JobsPanel>
  );
}

const WeightStepper = ({ value, onChange, disabled = false }) => (
  <span className="chip__w" style={{ padding: 0, gap: 2, opacity: disabled ? 0.55 : 1 }}>
    <button type="button" disabled={disabled} onClick={() => onChange(Math.max(1, value - 1))} style={stepBtnStyle}>−</button>
    <span style={{ padding: '0 4px' }}>×{value}</span>
    <button type="button" disabled={disabled} onClick={() => onChange(Math.min(5, value + 1))} style={stepBtnStyle}>+</button>
  </span>
);
const stepBtnStyle = {
  width: 14, height: 14, padding: 0, display: 'grid', placeItems: 'center',
  background: 'transparent', border: 0, color: 'var(--muted)', cursor: 'pointer',
  fontSize: 11, lineHeight: 1,
};

export default ProfilesPage;
