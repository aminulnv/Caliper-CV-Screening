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
  getCompletedRunsForProfile,
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
  formatSyncNote,
  readJobsCache,
  shouldRunRecruiteeSync,
  writeJobsCache,
} from '@/lib/jobs-cache'
import { CvViewer } from '@/caliper/components/CvViewer'
import { runsForDisplay, shapeJobRow } from '@/lib/job-profile'
import {
  getBiasWarning,
  getProtectedAttributeError,
} from '@/lib/criteria-validation'
import { ChecklistRow } from '@/caliper/components/CriteriaChecklist'
import { RelatedProfilesPane } from '@/caliper/components/RelatedProfilesPane'

function shapeJobsList(jobs: unknown[]) {
  return jobs.map((j) => shapeJobRow(j as Record<string, unknown>));
}

const StatCell = ({ label, value, delta, deltaTone, sub }) => (
  <div className="stats__cell">
    <div className="stats__lbl">{label}</div>
    <div className="stats__val">{value}</div>
    {delta && (
      <div className={`stats__delta${deltaTone ? ` stats__delta--${deltaTone}` : ''}`}>
        {deltaTone === 'up' ? '↑' : deltaTone === 'down' ? '↓' : '·'} {delta}
        {sub && <span className="muted" style={{ marginLeft: 4 }}> {sub}</span>}
      </div>
    )}
  </div>
);
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
} from '@/caliper/ui'

function getCriteriaListsForProfile(profile) {
  if (!profile) return { must: [], nice: [], flag: [] };
  return {
    must: profile.mustHave || [],
    nice: profile.niceToHave || [],
    flag: profile.redFlags || [],
  };
}

function formatFileSizeJob(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}



function delayJob(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function RunScreeningSheet({ profile: initialProfile, onClose, go, onEditCriteria }) {
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
  const [recruiteeRowSelected, setRecruiteeRowSelected] = React.useState([]);
  const [uploadedFiles, setUploadedFiles] = React.useState([]);
  const [recruiteeApplicants, setRecruiteeApplicants] = React.useState([]);
  const [recruiteeLoading, setRecruiteeLoading] = React.useState(false);
  const [runProcessing, setRunProcessing] = React.useState(null);
  const [runError, setRunError] = React.useState(null);
  const runCancelRef = React.useRef(false);
  const fileInputRef = React.useRef(null);

  React.useEffect(() => {
    setStep(1);
    setCvMode(profile.source === 'recruitee' ? 'recruitee' : 'manual');
    setRecruiteeRowSelected([]);
    setUploadedFiles([]);
    setRunProcessing(null);
    setRunError(null);
    runCancelRef.current = false;
  }, [profile.id]);

  React.useEffect(() => () => { runCancelRef.current = true; }, []);

  React.useEffect(() => {
    if (!profile.sourceRef || profile.source !== 'recruitee') {
      setRecruiteeApplicants([]);
      setRecruiteeLoading(false);
      return;
    }
    let cancelled = false;
    const cached = getCachedApplicants(profile.sourceRef);
    if (cached?.length) {
      setRecruiteeApplicants(cached);
      setRecruiteeRowSelected(cached.map(() => true));
      setRecruiteeLoading(false);
    } else {
      setRecruiteeLoading(true);
    }
    loadRecruiteeApplicants(profile.sourceRef)
      .then((apps) => {
        if (cancelled) return;
        setRecruiteeApplicants(apps);
        setRecruiteeRowSelected(apps.map(() => true));
      })
      .catch(() => {
        if (!cancelled) setRecruiteeApplicants([]);
      })
      .finally(() => {
        if (!cancelled) setRecruiteeLoading(false);
      });
    return () => { cancelled = true; };
  }, [profile.id, profile.sourceRef, profile.source]);

  const rows = recruiteeApplicants.map((a) => ({
    id: a.id,
    name: a.name || 'Unknown',
    loc: a.location || '—',
    cv_url: a.cv_url,
    status: a.cv_url ? 'ok' : 'warn',
    reason: a.cv_url ? '' : 'No CV attached in Recruitee',
  }));

  const rowSel = recruiteeRowSelected.length === rows.length ? recruiteeRowSelected : rows.map(() => true);
  const nSelectedRec = rowSel.filter(Boolean).length;
  const nWarnSelected = rows.filter((c, i) => rowSel[i] && c.status === 'warn').length;

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

  const canRun =
    hasCriteria
    && !runnable.error
    && !(cvMode === 'manual' && uploadedFiles.length === 0)
    && !(cvMode === 'recruitee' && !rowSel.some(Boolean));

  const continueBlockedReason = !hasCriteria
    ? 'Add and save at least one criterion on the Criteria tab first'
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
          .filter((r, i) => sel[i] && r.cv_url)
          .map((r) => ({
            type: 'recruitee',
            applicant_id: r.id,
            cv_url: r.cv_url.startsWith('http') ? r.cv_url : `recruitee-applicant:${r.id}`,
            name: r.name,
          }));
      }
      if (runCancelRef.current) { setRunProcessing(null); return; }
      setRunProcessing({ label: 'Starting screening run…', progress: 85 });
      const modelId = profile.screeningModel || undefined;
      const created = await api.runs.create({
        job_id: profile.id,
        cv_sources: cvSources,
        ...(modelId ? { model_id: modelId } : {}),
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
  }, [canRun, cvMode, uploadedFiles, rowSel, rows, profile.id, go, onClose]);

  const cvSum = {
    selected: cvMode === 'manual' ? uploadedFiles.length : rowSel.filter(Boolean).length,
    warnings: cvMode === 'recruitee' ? nWarnSelected : 0,
    noteLines: cvMode === 'manual'
      ? (uploadedFiles.length ? uploadedFiles.map((f) => `${f.name} · ${formatFileSizeJob(f.size)}`) : ['No files added yet.'])
      : (nWarnSelected > 0 ? rows.filter((c, i) => rowSel[i] && c.status === 'warn').map((c) => `${c.name} — ${c.reason}`) : ['No parse warnings.']),
  };

  return (
    <div className="detail" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(720px, 94vw)',
          alignSelf: 'center',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-lg)',
          margin: 'auto',
          boxShadow: 'var(--shadow-pop)',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div className="mono muted" style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Run screening</div>
            <h2 style={{ margin: '6px 0 0', fontSize: 20, fontWeight: 500 }}>{profile.name}</h2>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {profile.dept} · {criteriaCount} saved criteria
              {' · '}
              {labelForModel(runnable.modelId)}
              {runnable.substituted && profile.screeningModel && runnable.modelId !== profile.screeningModel
                ? ` (OpenAI used — add Anthropic key for ${labelForModel(profile.screeningModel)})`
                : ''}
              {' · '}Rubric is read from this job (edit under Jobs → Criteria).
            </div>
          </div>
          <IconBtn name="x" size={16} onClick={onClose}/>
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
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

          <div className="row" style={{ marginBottom: 12, gap: 8 }}>
            <button
              type="button"
              className={`tab-btn${step === 1 ? '' : ''}`}
              style={{
                padding: '8px 14px',
                borderRadius: 6,
                border: '1px solid var(--line)',
                background: step === 1 ? 'var(--bg-sunk)' : 'transparent',
                fontSize: 13,
                cursor: 'default',
              }}
              onClick={() => setStep(1)}
            >1 · CV source</button>
            <button
              type="button"
              style={{
                padding: '8px 14px',
                borderRadius: 6,
                border: '1px solid var(--line)',
                background: step === 2 ? 'var(--bg-sunk)' : 'transparent',
                fontSize: 13,
                cursor: 'default',
              }}
              onClick={() => setStep(2)}
            >2 · Review &amp; run</button>
          </div>

          {step === 1 && (
            <>
              <div className="wiz__pane-sub" style={{ marginBottom: 14 }}>
                Pull applicants from Recruitee when this job is linked, or upload PDF / DOCX (prototype — files stay in the browser).
              </div>
              <Segmented value={cvMode} onChange={setCvMode} options={[
                { value: 'recruitee', label: recruiteeLoading ? 'Recruitee · loading…' : `Recruitee · ${rows.length} applicant${rows.length === 1 ? '' : 's'}` },
                { value: 'manual', label: `Upload${uploadedFiles.length ? ` · ${uploadedFiles.length} file(s)` : ''}` },
              ]}/>

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
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <div className="row" style={{ gap: 8 }}>
                          <Btn size="sm" variant="ghost" onClick={() => setRecruiteeRowSelected(rows.map(() => true))}>Select all</Btn>
                          <Btn size="sm" variant="ghost" onClick={() => setRecruiteeRowSelected(rows.map(() => false))}>Unselect all</Btn>
                          <span className="muted mono" style={{ fontSize: 11 }}>{nSelectedRec} of {rows.length} selected</span>
                        </div>
                        {nWarnSelected > 0
                          ? <Badge tone="warn" dot>{nWarnSelected} without CV</Badge>
                          : <Badge tone="ok" dot>All have CVs</Badge>}
                      </div>
                      <div className="card" style={{ maxHeight: 280, overflow: 'auto' }}>
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
                            {rows.map((c, i) => (
                              <tr
                                key={c.id}
                                className={rowSel[i] ? 'is-selected' : ''}
                                onClick={() => {
                                  const next = [...rowSel];
                                  next[i] = !next[i];
                                  setRecruiteeRowSelected(next);
                                }}
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
                                <td><strong style={{ fontWeight: 500 }}>{c.name}</strong></td>
                                <td className="muted">{c.loc}</td>
                                <td>
                                  {c.status === 'ok'
                                    ? <Badge tone="ok" dot>Attached</Badge>
                                    : <span className="row" style={{ gap: 6 }}><Badge tone="warn" dot>Missing</Badge><span className="muted" style={{ fontSize: 11 }}>{c.reason}</span></span>}
                                </td>
                              </tr>
                            ))}
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
              {runnable.substituted && !runnable.error && (
                <div className="callout">
                  Screening will use <strong>{labelForModel(runnable.modelId)}</strong> because the job&apos;s
                  model has no API key configured. Add keys in Settings → AI provider.
                </div>
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
            </div>
          )}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {runError && (
            <div style={{ fontSize: 12, color: 'var(--bad)', padding: '6px 10px', background: 'var(--bad-bg, #fff5f5)', borderRadius: 6 }}>
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
              <Btn variant="primary" icon="play" disabled={!canRun} onClick={startRealRun}>Run now</Btn>
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

function PickJobToRunModal({ onClose, onPick, profiles }) {
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
        <div style={{ overflowY: 'auto', padding: 8 }}>
          {(profiles ?? []).map((p) => (
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
              <div style={{ fontWeight: 500 }}>{p.name}</div>
              <div className="muted mono" style={{ fontSize: 11, marginTop: 2 }}>{p.id} · {p.dept}</div>
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

function JobsPageLoading({ phase, onRetry }) {
  return (
    <div className="page">
      <div className="card">
        <div className="jobs-loading">
          <div className="jobs-loading__spinner" role="status" aria-label="Loading jobs" />
          <div style={{ marginTop: 16, fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}>
            Loading jobs
          </div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13, maxWidth: 360 }}>
            {phase}
          </div>
        </div>
      </div>
      {onRetry && (
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <Btn variant="default" onClick={onRetry}>Try again</Btn>
        </div>
      )}
    </div>
  );
}

function ProfilesPage({ go, route }) {
  const initialCache = React.useMemo(() => readJobsCache(), []);
  const [selectedId, setSelectedId] = React.useState(null);
  const [editorInitialTab, setEditorInitialTab] = React.useState(null);
  const [refreshToken, setRefreshToken] = React.useState({ n: 0, forceSync: false });
  const [showNew, setShowNew] = React.useState(false);
  const [filter, setFilter] = React.useState('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [runSheetProfileId, setRunSheetProfileId] = React.useState(null);
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
    const cache = readJobsCache();
    const runSync = shouldRunRecruiteeSync(
      cache?.lastSyncAt ?? null,
      refreshToken.forceSync,
    );

    if (!hadList) {
      setProfilesLoading(true);
      setProfilesLoadError(null);
      setLiveProfiles(null);
    } else {
      setBackgroundRefreshing(true);
    }

    (async () => {
      let syncNote = cache?.syncNote ?? '';
      let lastSyncAt = cache?.lastSyncAt ?? null;

      if (runSync) {
        if (!hadList) setLoadPhase('Syncing open roles from Recruitee…');
        try {
          const sync = await api.recruitee.syncJobs();
          if (!cancelled) {
            syncNote = formatSyncNote(sync);
            lastSyncAt = Date.now();
          }
        } catch {
          /* keep prior syncNote from cache */
        }
      }

      if (cancelled) return;
      if (!hadList) setLoadPhase('Loading your job list…');

      try {
        const jobs = await api.jobs.list();
        if (!cancelled) {
          const shaped = shapeJobsList(jobs);
          setLiveProfiles(shaped);
          setProfilesLoadError(null);
          writeJobsCache({
            jobs,
            fetchedAt: Date.now(),
            lastSyncAt: runSync ? lastSyncAt : cache?.lastSyncAt ?? lastSyncAt,
            syncNote,
          });
        }
      } catch (err) {
        if (!cancelled && !hadList) {
          setLiveProfiles(null);
          setProfilesLoadError(err?.message ?? 'Failed to load jobs.');
        }
      } finally {
        if (!cancelled) {
          setProfilesLoading(false);
          setBackgroundRefreshing(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [refreshToken.n, refreshToken.forceSync]);

  const jobs = liveProfiles ?? [];
  const profile = selectedId && liveProfiles ? liveProfiles.find((p) => p.id === selectedId) : null;

  const openRunJobId = route && route.openRunJobId;

  React.useEffect(() => {
    if (!openRunJobId || !liveProfiles?.some((p) => p.id === openRunJobId)) return;
    setRunSheetProfileId(openRunJobId);
    setSelectedId(null);
    if (typeof history !== 'undefined' && String(location.hash).includes('job=')) {
      try {
        history.replaceState(null, '', '#profiles');
      } catch (_) {}
    }
  }, [openRunJobId, liveProfiles]);

  if (profile) {
    return (
      <>
        <ProfileEditor
          profile={profile}
          initialTab={editorInitialTab}
          onBack={() => {
            setRunSheetProfileId(null);
            setSelectedId(null);
            setEditorInitialTab(null);
          }}
          go={go}
          onOpenRunSheet={() => setRunSheetProfileId(profile.id)}
        />
        {runSheetProfileId === profile.id && (
          <RunScreeningSheet
            profile={profile}
            onClose={() => setRunSheetProfileId(null)}
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
    if (q && !p.name.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q)) return false;
    if (filter === 'all') return true;
    if (filter === 'open') return p.status === 'open';
    if (filter === 'closed') return p.status === 'closed';
    if (filter === 'recruitee') return p.source === 'recruitee';
    if (filter === 'manual') return p.source === 'manual';
    return true;
  });

  const openCount = jobs.filter((p) => p.status === 'open').length;
  const totalRuns = jobs.reduce((sum, p) => sum + (p.runsCount || 0), 0);
  const avgRunsPerJob = jobs.length ? Math.round(totalRuns / jobs.length) : 0;

  return (
    <div className="page">
      {backgroundRefreshing && (
        <div className="jobs-refresh-banner" role="status">
          Updating job list…
        </div>
      )}

      <div className="stats" style={{ marginTop: 20, marginBottom: 28 }}>
        <StatCell label="Open jobs" value={openCount} />
        <StatCell label="Avg. runs per job" value={avgRunsPerJob || '—'} />
        <StatCell label="Total jobs" value={jobs.length} />
      </div>

      <div className="row jobs-toolbar" style={{ marginBottom: 14, gap: 8 }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320, minWidth: 160 }}>
          <input
            className="inp"
            placeholder="Search jobs by title…"
            style={{ paddingLeft: 32 }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search jobs"
          />
          <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--muted)' }}/>
        </div>
        <Segmented value={filter} onChange={setFilter} options={[
          { value: 'all',       label: `All ${jobs.length}` },
          { value: 'open',      label: 'Open' },
          { value: 'closed',    label: 'Closed' },
          { value: 'recruitee', label: 'From Recruitee' },
          { value: 'manual',    label: 'Manually added' },
        ]}/>
        <div className="spacer"/>
        <Btn
          variant="ghost"
          icon="history"
          disabled={backgroundRefreshing}
          onClick={() => refreshProfiles({ forceSync: true })}
        >
          {backgroundRefreshing ? 'Syncing…' : 'Sync Recruitee'}
        </Btn>
        <Btn variant="default" icon="play" onClick={() => setShowRunPicker(true)}>Run screening</Btn>
        <Btn variant="primary" icon="plus" onClick={() => setShowNew(true)}>New job</Btn>
      </div>

      <div className="card">
        <table className="tbl tbl--fixed">
          <thead>
            <tr>
              <th>Job announcement</th>
              <th style={{ width: 112 }}>Posted</th>
              <th style={{ width: 120 }}>Source</th>
              <th style={{ width: 140 }}>Department</th>
              <th style={{ width: 88 }} className="col-right">Applicants</th>
              <th style={{ width: 160 }}>Criteria</th>
              <th style={{ width: 90 }} className="col-right">Runs</th>
              <th style={{ width: 130 }}>Last run</th>
              <th style={{ width: 100 }}>Status</th>
              <th style={{ width: 36 }}/>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const mc = (p.mustHave || []).length;
              const nc = (p.niceToHave || []).length;
              const fc = (p.redFlags || []).length;
              const total = mc + nc + fc;
              return (
                <tr
                  key={p.id}
                  onMouseDown={() => {
                    if (p.source === 'recruitee' && p.sourceRef) {
                      prefetchRecruiteeApplicants(p.sourceRef);
                    }
                  }}
                  onClick={() => openJobProfile(setSelectedId, setEditorInitialTab, setRunSheetProfileId, p)}
                >
                  <td>
                    <div style={{ fontWeight: 500 }}>{p.name}</div>
                    <div className="muted mono" style={{ fontSize: 11, marginTop: 1 }}>
                      {p.id}
                    </div>
                  </td>
                  <td className="mono muted" style={{ fontSize: 11.5 }}>{p.postedOn ?? '—'}</td>
                  <td>
                    {p.source === 'recruitee'
                      ? <Badge tone="info"><Icon name="database" size={10}/> Recruitee</Badge>
                      : <Badge tone="ghost"><Icon name="edit" size={10}/> Manual</Badge>}
                  </td>
                  <td className="muted">
                    <span className="cell-truncate" title={p.dept}>{p.dept}</span>
                  </td>
                  <td className="col-num col-right mono" style={{ fontSize: 12.5 }}>
                    {p.source === 'recruitee' && p.applicantsCount != null
                      ? p.applicantsCount
                      : '—'}
                  </td>
                  <td>
                    {total > 0 ? (
                      <span className="row" style={{ gap: 6, alignItems: 'center' }}>
                        <CriteriaKindCountBadge count={mc} kind="must"/>
                        <CriteriaKindCountBadge count={nc} kind="nice"/>
                        <CriteriaKindCountBadge count={fc} kind="flag"/>
                        <span className="muted mono" style={{ fontSize: 10.5, marginLeft: 4 }}>
                          {total} total
                        </span>
                      </span>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>
                        <Icon name="plus" size={11}/> Add criteria
                      </span>
                    )}
                  </td>
                  <td className="col-num col-right">{p.runsCount || 0}</td>
                  <td className="mono" style={{ fontSize: 11.5 }}>{p.lastRun || '—'}</td>
                  <td>
                    <Badge tone={p.status === 'open' ? 'ok' : p.status === 'closed' ? 'ghost' : 'default'} dot={p.status === 'open'}>
                      {p.status === 'open' ? 'Open' : p.status === 'closed' ? 'Closed' : 'Archived'}
                    </Badge>
                  </td>
                  <td><Icon name="chevron-right" size={14} className="muted"/></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
        <div className="muted" style={{ fontSize: 11.5 }}>
          {filtered.length} of {jobs.length} jobs
        </div>
        <div className="row" style={{ gap: 4 }}>
          <Btn variant="ghost" size="sm" icon="chevron-left">Prev</Btn>
          <Btn variant="ghost" size="sm" iconRight="chevron-right">Next</Btn>
        </div>
      </div>

      {showNew && (
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
              .catch(() => {});
            setShowNew(false);
            setEditorInitialTab('criteria');
            setSelectedId(newProfile.id);
          }}
        />
      )}
      {showRunPicker && (
        <PickJobToRunModal
          profiles={jobs}
          onClose={() => setShowRunPicker(false)}
          onPick={(id) => {
            setShowRunPicker(false);
            setRunSheetProfileId(id);
          }}
        />
      )}
      {runSheetProfile && (
        <RunScreeningSheet
          profile={runSheetProfile}
          onClose={() => setRunSheetProfileId(null)}
          go={go}
          onEditCriteria={() => {
            const jobId = runSheetProfileId;
            setRunSheetProfileId(null);
            setEditorInitialTab('criteria');
            setSelectedId(jobId);
          }}
        />
      )}
    </div>
  );
}

const CRITERIA_KIND_BADGE_BG = {
  must: 'var(--ok)',
  nice: 'var(--warn)',
  flag: 'var(--bad)',
};

const CRITERIA_KIND_BADGE_LABEL = {
  must: 'must-have',
  nice: 'nice-to-have',
  flag: 'red flag',
};

function CriteriaKindCountBadge({ count, kind }) {
  if (count <= 0) return null;
  const bg = CRITERIA_KIND_BADGE_BG[kind] || 'var(--muted)';
  const kindLabel = CRITERIA_KIND_BADGE_LABEL[kind] || 'criteria';
  const label = `${count} ${kindLabel}${count === 1 ? '' : 's'}`;
  return (
    <span
      className="mono criteria-kind-count-badge"
      role="img"
      aria-label={label}
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 22,
        height: 22,
        padding: '0 6px',
        borderRadius: 9999,
        background: bg,
        color: '#fff',
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1,
        boxSizing: 'border-box',
      }}
    >
      {count}
    </span>
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

function openJobProfile(setSelectedId, setEditorInitialTab, setRunSheetProfileId, profile) {
  if (profile.source === 'recruitee' && profile.sourceRef) {
    prefetchRecruiteeApplicants(profile.sourceRef);
  }
  setRunSheetProfileId(null);
  const lists = getCriteriaListsForProfile(profile);
  const criteriaCount = lists.must.length + lists.nice.length + lists.flag.length;
  setEditorInitialTab(criteriaCount === 0 ? 'criteria' : null);
  setSelectedId(profile.id);
}

function ProfileEditor({ profile: initialProfile, initialTab, onBack, go, onOpenRunSheet }) {
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
        criteria,
      });
      profile.screeningModel = screeningModel;
      profile.mustHave = mh;
      profile.niceToHave = nh;
      profile.redFlags = rf;
      profile.description = desc;
      criteriaDirtyRef.current = false;
      clearJobsCache();
      setSaveState({ status: 'saved', message: 'Saved.' });
      setTimeout(() => setSaveState({ status: 'idle', message: '' }), 2500);
    } catch (err) {
      setSaveState({ status: 'error', message: err?.message ?? 'Save failed.' });
    }
  }, [isHero, profile, mh, nh, rf, desc, screeningModel]);

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

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 16, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="linkish" onClick={onBack}>← Jobs</button>
          {profile.source === 'recruitee'
            ? <Badge tone="info"><Icon name="database" size={11}/> Recruitee · {profile.sourceRef}</Badge>
            : <Badge tone="ghost"><Icon name="edit" size={11}/> Manually added</Badge>}
          <Badge tone={profile.status === 'open' ? 'ok' : 'ghost'} dot={profile.status === 'open'}>
            {profile.status === 'open' ? 'Open' : profile.status === 'closed' ? 'Closed' : 'Archived'}
          </Badge>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" icon="copy">Duplicate</Btn>
          <Btn variant="ghost" icon="archive">Archive</Btn>
          <Btn variant="primary" icon="play" onClick={() => onOpenRunSheet && onOpenRunSheet()}>Run screening</Btn>
        </div>
      </div>

      {/* Tabbed: Overview · Criteria · Runs · Audit */}
      <ProfileTabs
        key={profile.id}
        profile={profile}
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
        desc={desc}
      />
    </div>
  );
}

function ProfileTabs({
  profile, initialTab, desc, setDesc, mh, setMH, nh, setNH, rf, setRF,
  runsToShow, showBias, setShowBias, totalCriteria,
  workspaceSettings, screeningModel, setScreeningModel, onSaveProfile, saveState, isHero,
  go, onOpenRunSheet, criteriaGenState, onGenerateCriteria,
}) {
  const [tab, setTab] = React.useState(() => (initialTab === 'criteria' ? 'criteria' : 'overview'));
  React.useLayoutEffect(() => {
    setTab(initialTab === 'criteria' ? 'criteria' : 'overview');
  }, [profile.id, initialTab]);
  const candidateRows = React.useMemo(
    () => (typeof getCandidateRowsForJob === 'function' ? getCandidateRowsForJob(profile.id) : []),
    [profile.id],
  );
  const completedRunsForJob = React.useMemo(
    () => (typeof getCompletedRunsForProfile === 'function' ? getCompletedRunsForProfile(profile.id) : []),
    [profile.id],
  );
  const initialApplicants = React.useMemo(
    () => (profile.sourceRef ? getCachedApplicants(profile.sourceRef) : null),
    [profile.sourceRef],
  );
  const [recruiteeApps, setRecruiteeApps] = React.useState(() => initialApplicants ?? []);
  const [recruiteeAppsLoading, setRecruiteeAppsLoading] = React.useState(
    () =>
      profile.source === 'recruitee'
      && Boolean(profile.sourceRef)
      && !(initialApplicants?.length),
  );
  const [recruiteeAppsError, setRecruiteeAppsError] = React.useState(null);
  const [auditCount, setAuditCount] = React.useState(0);
  const [relatedCount, setRelatedCount] = React.useState(0);

  React.useEffect(() => {
    if (!profile?.id || profile.id === HERO_PROFILE.id) {
      setRelatedCount(0);
      return;
    }
    api.jobs.relatedProfiles(profile.id)
      .then((rows) => setRelatedCount(rows.length))
      .catch(() => setRelatedCount(0));
  }, [profile.id]);

  React.useEffect(() => {
    if (profile.source !== 'recruitee' || !profile.sourceRef) {
      setRecruiteeApps([]);
      setRecruiteeAppsLoading(false);
      setRecruiteeAppsError(null);
      return;
    }

    let cancelled = false;
    const cached = getCachedApplicants(profile.sourceRef);
    if (cached?.length) {
      setRecruiteeApps(cached);
      setRecruiteeAppsLoading(false);
      setRecruiteeAppsError(null);
    } else {
      setRecruiteeAppsLoading(true);
      setRecruiteeAppsError(null);
    }

    loadRecruiteeApplicants(profile.sourceRef)
      .then((apps) => {
        if (!cancelled) {
          setRecruiteeApps(apps);
          setRecruiteeAppsError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setRecruiteeApps([]);
          setRecruiteeAppsError(err?.message ?? 'Failed to load applicants from Recruitee.');
        }
      })
      .finally(() => {
        if (!cancelled) setRecruiteeAppsLoading(false);
      });

    return () => { cancelled = true; };
  }, [profile.id, profile.sourceRef, profile.source]);

  const candidatesTabCount = Math.max(
    candidateRows.length,
    recruiteeApps.length,
    profile.applicantsCount ?? 0,
    initialApplicants?.length ?? 0,
  );

  return (
    <>
      <div className="row" style={{ marginBottom: 18, borderBottom: '1px solid var(--line)', gap: 0 }} role="tablist" aria-label="Job sections">
        <TabBtn label="Overview"  count={null}            active={tab === 'overview'} onClick={() => setTab('overview')}/>
        <TabBtn label="Criteria"  count={totalCriteria}   active={tab === 'criteria'} onClick={() => setTab('criteria')}/>
        <TabBtn label="Runs"      count={runsToShow.length} active={tab === 'runs'}   onClick={() => setTab('runs')}/>
        <TabBtn label="Candidates" count={candidatesTabCount} active={tab === 'candidates'} onClick={() => setTab('candidates')}/>
        <TabBtn label="Related profiles" count={relatedCount} active={tab === 'related'} onClick={() => setTab('related')}/>
        <TabBtn label="Audit"     count={auditCount}      active={tab === 'audit'}    onClick={() => setTab('audit')}/>
      </div>

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
          onGoToCriteria={() => setTab('criteria')}
        />
      )}
      {tab === 'criteria' && (
        <CriteriaPane
          mh={mh} setMH={setMH} nh={nh} setNH={setNH} rf={rf} setRF={setRF}
          showBias={showBias} setShowBias={setShowBias}
          workspaceSettings={workspaceSettings}
          screeningModel={screeningModel}
          setScreeningModel={setScreeningModel}
          onSave={onSaveProfile}
          saveState={saveState}
          isHero={isHero}
          criteriaGenState={criteriaGenState}
          onGenerateCriteria={onGenerateCriteria}
          hasUsableDescription={isUsableJobDescription(desc)}
        />
      )}
      {tab === 'runs'     && <RunsPane runs={runsToShow} go={go} onOpenRunSheet={onOpenRunSheet}/>}
      {tab === 'candidates' && (
        <JobCandidatesPane
          profile={profile}
          rows={candidateRows}
          recruiteeApps={recruiteeApps}
          recruiteeLoading={recruiteeAppsLoading}
          recruiteeError={recruiteeAppsError}
          completedRuns={completedRunsForJob}
          go={go}
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
      {tab === 'related' && (
        <RelatedProfilesPane
          jobId={profile.id}
          jobName={profile.name}
          hasDescription={Boolean(desc?.trim())}
          isHero={isHero}
          workspaceSettings={workspaceSettings}
          screeningModel={screeningModel}
        />
      )}
    </>
  );
}

const TabBtn = ({ label, count, active, onClick }) => (
  <button
    type="button"
    role="tab"
    aria-selected={active}
    className="profile-tab-btn"
    onClick={onClick}
  >
    {label}
    {count != null && <span className="mono" style={{ fontSize: 10.5, marginLeft: 6, color: 'var(--subtle)' }}>{count}</span>}
  </button>
);

function looksLikeHtml(text) {
  return typeof text === 'string' && /<[a-z][\s\S]*>/i.test(text);
}

/* ----- Overview pane ----- */
function OverviewPane({ profile, desc, setDesc, mh, nh, rf, screeningModel, runsToShow, go, onGoToCriteria }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'flex-start' }}>
      <div className="col" style={{ gap: 18 }}>
        <div className="card">
          <div className="card__head">
            <Icon name="doc" size={14} className="muted"/>
            <span className="card__title">Job description</span>
            <div className="spacer"/>
            {profile.source === 'recruitee'
              ? <span className="muted mono" style={{ fontSize: 11 }}>Synced from Recruitee · {profile.sourceRef}</span>
              : <Btn size="sm" variant="ghost" icon="edit">Edit</Btn>}
          </div>
          <div className="card__body">
            {profile.source === 'recruitee' ? (
              looksLikeHtml(desc) ? (
                <div
                  className="job-desc-html"
                  dangerouslySetInnerHTML={{ __html: desc }}
                />
              ) : (
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
                  {desc || 'No description available from Recruitee.'}
                </div>
              )
            ) : (
              <textarea className="ta" rows={10} value={desc} onChange={(e) => setDesc(e.target.value)}/>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card__head">
            <Icon name="sliders" size={14} className="muted"/>
            <span className="card__title">Criteria summary</span>
            <div className="spacer"/>
            <Btn size="sm" variant="ghost" icon="edit" onClick={() => onGoToCriteria && onGoToCriteria()}>Edit criteria</Btn>
          </div>
          <div className="card__body" style={{ paddingTop: 14 }}>
            <SummaryGroup kind="must" label="Must-have"     items={mh}/>
            <SummaryGroup kind="nice" label="Nice-to-have"  items={nh}/>
            <SummaryGroup kind="flag" label="Red flags"     items={rf}/>
            {mh.length + nh.length + rf.length === 0 && (
              <div className="callout">No criteria yet. Add them in the Criteria tab before starting a run.</div>
            )}
          </div>
        </div>
      </div>

      <div className="col" style={{ gap: 14 }}>
        <div className="card">
          <div className="card__head">
            <Icon name="history" size={14} className="muted"/>
            <span className="card__title">Recent runs</span>
          </div>
          <div className="card__body" style={{ padding: 0 }}>
            {runsToShow.length === 0 && <div className="muted" style={{ padding: 18, fontSize: 12.5 }}>No runs yet. Use <strong>Run screening</strong> above to screen CVs for this job.</div>}
            {runsToShow.map((r, i) => (
              <div
                key={r.id}
                role="button"
                tabIndex={0}
                onClick={() => go && go('results', r.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    go && go('results', r.id);
                  }
                }}
                   style={{ padding: '12px 16px', borderTop: i ? '1px solid var(--line-soft)' : 'none', cursor: 'pointer' }}>
                <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{r.id}</div>
                <div className="row" style={{ gap: 8, marginTop: 4 }}>
                  <span className="mono tnum" style={{ fontSize: 12 }}>{r.date}</span>
                  <span className="muted" style={{ fontSize: 11.5 }}>· {r.cvs} CVs</span>
                </div>
                {r.scoreRange && (
                  <div className="row" style={{ marginTop: 6, gap: 6 }}>
                    <span className="mono tnum" style={{ fontSize: 11 }}>{r.scoreRange[0]}</span>
                    <span style={{
                      flex: 1, height: 3, borderRadius: 2,
                      background: `linear-gradient(90deg, var(--bad) 0%, var(--warn) ${r.scoreRange[0]}%, var(--ok) ${r.scoreRange[1]}%, var(--line-soft) ${r.scoreRange[1]}%)`,
                    }}/>
                    <span className="mono tnum" style={{ fontSize: 11 }}>{r.scoreRange[1]}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card__head">
            <Icon name="info" size={14} className="muted"/>
            <span className="card__title">Quick facts</span>
          </div>
          <div className="card__body">
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
          </div>
        </div>
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
  mh, setMH, nh, setNH, rf, setRF, showBias, setShowBias,
  workspaceSettings, screeningModel, setScreeningModel, onSave, saveState, isHero,
  criteriaGenState, onGenerateCriteria, hasUsableDescription,
}) {
  const [biasPending, setBiasPending] = React.useState(null);
  const generating = criteriaGenState?.status === 'loading';

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
          <Btn
            variant="default"
            icon="sparkle"
            disabled={generating || !hasUsableDescription}
            onClick={() => onGenerateCriteria && onGenerateCriteria()}
          >
            {generating ? 'Generating…' : 'Generate from job description'}
          </Btn>
        </div>
      )}
      <ScreeningModelPicker
        modelId={screeningModel}
        onChange={setScreeningModel}
        settings={workspaceSettings}
      />
      <CriteriaList kind="must" label="Must-have criteria"
        help="Missing or weak evidence applies a heavy score penalty. Quoted CV evidence counts fully; inferred matches count for less."
        items={mh} setItems={setMH}
        onBiasWarn={(payload) => { setBiasPending({ ...payload, kind: 'must' }); setShowBias(true); }}/>
      <CriteriaList kind="nice" label="Nice-to-have"
        help="Boosts when matched with evidence. Doesn't penalise when missing."
        items={nh} setItems={setNH}
        onBiasWarn={(payload) => { setBiasPending({ ...payload, kind: 'nice' }); setShowBias(true); }}/>
      <CriteriaList kind="flag" label="Red flags"
        help="If matched, points are deducted (weight ×4 per flag, ×2 if inferred) and the candidate is marked Flagged."
        items={rf} setItems={setRF}
        onBiasWarn={(payload) => { setBiasPending({ ...payload, kind: 'flag' }); setShowBias(true); }}/>
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

      {!isHero && (
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
function RunsPane({ runs, go, onOpenRunSheet }) {
  if (runs.length === 0) {
    return (
      <div className="card">
        <div className="empty">
          <Icon name="list" size={22}/>
          <div style={{ marginTop: 8, fontSize: 14, color: 'var(--ink)' }}>No screening runs yet</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            Start one to score CVs for this job.
          </div>
          <div style={{ marginTop: 16 }}>
            <Btn variant="primary" icon="play" onClick={() => onOpenRunSheet && onOpenRunSheet()}>Run screening</Btn>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="card">
      <table className="tbl">
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
          {runs.map(r => (
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
  recruiteeApps,
  recruiteeLoading,
  recruiteeError,
  completedRuns,
  go,
  onOpenRunSheet,
}) {
  const [cvPreview, setCvPreview] = React.useState(null);

  const uniquePeople = React.useMemo(() => {
    const s = new Set();
    rows.forEach((r) => s.add(r.name.toLowerCase()));
    return s.size;
  }, [rows]);

  const hasRecruitee = profile.source === 'recruitee' && profile.sourceRef;
  const hasScreened = rows.length > 0 && completedRuns.length > 0;
  const showRecruitee = hasRecruitee && (recruiteeLoading || recruiteeApps.length > 0);

  if (!showRecruitee && !hasScreened) {
    return (
      <div className="card">
        <div className="empty">
          <Icon name="users" size={22}/>
          <div style={{ marginTop: 8, fontSize: 14, color: 'var(--ink)' }}>
            {recruiteeLoading
              ? 'Loading applicants from Recruitee…'
              : recruiteeError
                ? 'Could not load applicants'
                : 'No applicants yet'}
          </div>
          {recruiteeError && (
            <div className="callout" style={{ marginTop: 12, maxWidth: '52ch', textAlign: 'left' }}>
              {recruiteeError}
              {(profile.applicantsCount ?? 0) > 0 && (
                <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                  Recruitee reports {profile.applicantsCount} applicants for this role — fix the connection and refresh.
                </div>
              )}
            </div>
          )}
          {!recruiteeLoading && !recruiteeError && (
            <>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4, maxWidth: '48ch' }}>
                Applicants from Recruitee appear here. After screening, scored candidates show in a separate section.
              </div>
              <div style={{ marginTop: 16 }}>
                <Btn variant="primary" icon="play" onClick={() => onOpenRunSheet && onOpenRunSheet()}>Run screening</Btn>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      {showRecruitee && (
        <>
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
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
            {' '}Use <strong>Run screening</strong> to score CVs from this list.
          </div>
          <div className="card">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th style={{ width: 140 }}>Location</th>
                  <th style={{ width: 140 }}>Stage</th>
                  <th style={{ width: 100 }}>CV</th>
                </tr>
              </thead>
              <tbody>
                {recruiteeLoading && recruiteeApps.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted" style={{ padding: 20, fontSize: 12.5 }}>
                      Loading applicants…
                    </td>
                  </tr>
                )}
                {recruiteeApps.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div style={{ fontWeight: 500, fontSize: 13.5 }}>{a.name || 'Unknown'}</div>
                    </td>
                    <td className="muted">{a.location || '—'}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{a.status || '—'}</td>
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
                ))}
              </tbody>
            </table>
          </div>
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
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
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
                {rows.map((row) => (
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
    </div>
  );
}

const AUDIT_KIND_META = {
  criteria: { icon: 'sliders', label: 'Criteria' },
  run: { icon: 'play', label: 'Screening' },
  override: { icon: 'edit', label: 'Override' },
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
    <div className="card">
      <div className="card__head">
        <Icon name="history" size={14} className="muted"/>
        <span className="card__title">Activity log</span>
        <div className="spacer"/>
        {!loading && entries.length > 0 && (
          <Btn size="sm" variant="ghost" onClick={loadAudit}>Refresh</Btn>
        )}
        <span className="mono muted" style={{ fontSize: 11 }}>
          {loading ? 'Loading…' : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}
        </span>
      </div>
      <div className="card__body" style={{ paddingTop: 4 }}>
        {loading && (
          <div className="muted" style={{ padding: 18, fontSize: 12.5 }}>Loading activity…</div>
        )}
        {!loading && entries.length === 0 && (
          <div className="empty" style={{ padding: '24px 18px' }}>
            <Icon name="history" size={22}/>
            <div style={{ marginTop: 8, fontSize: 14, color: 'var(--ink)' }}>No activity yet</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4, maxWidth: '52ch', lineHeight: 1.55 }}>
              Saving criteria, running screening, and overriding scores on this job are recorded here automatically.
            </div>
          </div>
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
      </div>
    </div>
  );
}


/* ----- Criteria list (shared) ----- */
function CriteriaList({ kind, label, help, items, setItems, onBiasWarn }) {
  const [input, setInput] = React.useState('');
  const [weight, setWeight] = React.useState(kind === 'must' ? 5 : 3);
  const [inputError, setInputError] = React.useState('');

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

  return (
    <div className="crit-list">
      {hasDraft && (
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
              <span key={it.id} className={`chip chip--${kind}`}>
                <span className="chip__crit-name">{it.name}</span>
                <span className="chip__crit-actions">
                  <WeightStepper value={it.weight} onChange={(w) => setWeightFor(it.id, w)}/>
                  <button type="button" className="chip__x" onClick={() => remove(it.id)} aria-label={`Remove ${it.name}`}><Icon name="x" size={10} stroke={2}/></button>
                </span>
              </span>
            ))}
        </div>
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
      </div>
    </div>
  );
}

const WeightStepper = ({ value, onChange }) => (
  <span className="chip__w" style={{ padding: 0, gap: 2 }}>
    <button onClick={() => onChange(Math.max(1, value - 1))} style={stepBtnStyle}>−</button>
    <span style={{ padding: '0 4px' }}>×{value}</span>
    <button onClick={() => onChange(Math.min(5, value + 1))} style={stepBtnStyle}>+</button>
  </span>
);
const stepBtnStyle = {
  width: 14, height: 14, padding: 0, display: 'grid', placeItems: 'center',
  background: 'transparent', border: 0, color: 'var(--muted)', cursor: 'pointer',
  fontSize: 11, lineHeight: 1,
};

export default ProfilesPage;
