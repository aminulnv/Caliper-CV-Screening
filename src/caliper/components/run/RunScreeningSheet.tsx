// @ts-nocheck
import React from 'react'
import { HERO_PROFILE } from '@/caliper/data'
import { api } from '@/services/api'
import type { JobPriorScreening } from '@/services/api'
import { labelForModel, resolveRunnableModel } from '@/lib/screening-models'
import { getCachedApplicants, loadRecruiteeApplicants } from '@/lib/applicants-cache'
import { shapeJobRow } from '@/lib/job-profile'
import { ChecklistRow } from '@/caliper/components/CriteriaChecklist'
import { RerunConflictAlert, formatPriorScreeningMeta } from '@/caliper/components/RerunConflictAlert'
import { getCriteriaListsForProfile } from '@/caliper/components/jobs/jobs-utils'
import { Icon, Btn, IconBtn, Badge } from '@/caliper/ui'

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

/** Already-screened applicants stay visible but are excluded from bulk selection. */
function isRunSheetRowVisible() {
  return true;
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

/** null = every selectable applicant in the current list is selected. */
function pickInitialApplicantSelection(apps, initialStage) {
  if (!initialStage || initialStage === 'all') return null;
  const ids = new Set();
  for (const a of apps) {
    const stage = a.status || a.stage_name || 'No stage set';
    const stageName = a.stage_name || '';
    const status = a.status || '';
    if (stage === initialStage || stageName === initialStage || status === initialStage) {
      ids.add(String(a.id));
    }
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

export function RunScreeningSheet({ profile: initialProfile, initialStage, onClose, go, onEditCriteria }) {
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
      if (selectedApplicantIds === null) {
        return !isPriorScreenedRow(r, priorIndex);
      }
      return selectedApplicantIds.has(applicantIdForRow(r));
    });
  }, [rows, selectedApplicantIds, priorIndex]);

  const nSelectedRec = rowSel.filter(Boolean).length;
  const nSelectedOkRec = rows.filter((c, i) => rowSel[i] && c.status === 'ok').length;
  const nWarnSelected = rows.filter((c, i) => rowSel[i] && c.status === 'warn').length;
  const selectableApplicantCount = rows.filter((r) => !isPriorScreenedRow(r, priorIndex)).length;
  const recruiteeScreenableCount = rows.filter((r) => r.status === 'ok' && !isPriorScreenedRow(r, priorIndex)).length;

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
    if (!row) return;
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
    if (cvMode !== 'recruitee' || !priorScreeningsReady) return [];
    const list = [];
    rows.forEach((row, i) => {
      const id = applicantIdForRow(row);
      const selected = selectedApplicantIds === null
        ? !isPriorScreenedRow(row, priorIndex)
        : selectedApplicantIds.has(id);
      if (!selected || row.status !== 'ok') return;
      const conflict = lookupPriorConflict(row, i, priorIndex);
      if (conflict) list.push(conflict);
    });
    return list;
  }, [cvMode, rows, selectedApplicantIds, priorIndex, priorScreeningsReady]);

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
    selected: cvMode === 'manual' ? uploadedFiles.length : nSelectedOkRec,
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
    && !(cvMode === 'recruitee' && nSelectedOkRec === 0);

  const continueBlockedReason = !hasCriteria
    ? 'Add and save at least one criterion on the Criteria tab first'
    : budgetBlocked
      ? 'AI credits exhausted'
    : runnable.error
      ? runnable.error
      : cvMode === 'recruitee' && !priorScreeningsReady
        ? 'Loading prior screening history…'
      : cvMode === 'recruitee' && nSelectedOkRec === 0
        ? (nSelectedRec > 0 ? 'Selected applicants need attached CVs' : 'Select at least one applicant with a CV')
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
        <div className="run-sheet__layout">
        <div className="run-sheet__main">
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
                      : `${recruiteeScreenableCount} screenable applicant${recruiteeScreenableCount === 1 ? '' : 's'}`}
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
                          {' '}<span className="mono">{nSelectedRec}</span> of <span className="mono">{selectableApplicantCount}</span> selected.
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
                          prominent
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
                  prominent
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

        <aside className="run-sheet__aside" aria-label="Run summary">
          <div className="run-sheet__summary-title">Summary</div>
          <div className="run-sheet__summary-row">
            <span>Selected CVs</span>
            <span className="run-sheet__summary-val mono">{cvSum.selected}</span>
          </div>
          <div className="run-sheet__summary-row">
            <span>Criteria</span>
            <span className="run-sheet__summary-val">{criteriaCount}</span>
          </div>
          <div className="run-sheet__summary-row">
            <span>Model</span>
            <span className="run-sheet__summary-val" style={{ fontSize: 11.5 }}>{labelForModel(runnable.modelId)}</span>
          </div>
          {usageEstimate && (
            <div className="run-sheet__summary-row">
              <span>Est. cost</span>
              <span className="run-sheet__summary-val mono">{formatEstUsd(usageEstimate.estimated_cost_usd)}</span>
            </div>
          )}
          {cvMode === 'recruitee' && step === 1 && (
            <div className="run-sheet__summary-row">
              <span>Applicants</span>
              <span className="run-sheet__summary-val mono">{nSelectedRec}/{selectableApplicantCount}</span>
            </div>
          )}
        </aside>
        </div>
        </div>

        <div className="run-sheet__foot run-sheet__foot--sticky">
          {runError && (
            <div className="callout" style={{ color: 'var(--bad)', marginBottom: 8, flex: '1 1 100%' }}>
              {runError}
            </div>
          )}
          {step === 1 && cvSum.selected > 0 && (
            <div className="run-sheet__foot-selection">
              <strong className="mono">{cvSum.selected}</strong> selected
              {cvMode === 'recruitee' && nWarnSelected > 0 && (
                <span className="muted"> · {nWarnSelected} without CV</span>
              )}
            </div>
          )}
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginLeft: 'auto' }}>
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
                disabled={
                  !hasCriteria
                  || budgetBlocked
                  || (cvMode === 'manual' && !uploadedFiles.length)
                  || (cvMode === 'recruitee' && (!priorScreeningsReady || nSelectedOkRec === 0))
                }
                title={continueBlockedReason || undefined}
              >
                {cvSum.selected > 0 ? `Continue · ${cvSum.selected} CV${cvSum.selected === 1 ? '' : 's'}` : 'Continue'}
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
