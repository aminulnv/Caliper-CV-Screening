// @ts-nocheck
// Page 4 — Jobs library + editor (each row is one open role / announcement).
// Primary screening path: Run screening sheet (CVs + review) from a job.
import React from 'react'
import {
  PROFILES,
  RUNS,
  HERO_PROFILE,
  RECRUITEE_JOBS,
  RECRUITEE_APPLICANT_ROWS,
  DEFAULT_RECRUITEE_ROW_SELECTED,
  JOB_DESC_PREVIEW,
  getCandidateRowsForJob,
  getCompletedRunsForProfile,
  AUDIT,
  formatRunIdFromDate,
  DEMO_RUN_SESSION_KEY,
} from '@/caliper/data'
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

function getRecruiteeAppsForProfile(profile) {
  if (profile.source === 'recruitee' && profile.sourceRef) {
    return RECRUITEE_JOBS.find((j) => j.id === profile.sourceRef)?.apps ?? 38;
  }
  return 38;
}

function getJobSheetCvSummary(cvMode, uploadedFiles, rowSel) {
  const rows = RECRUITEE_APPLICANT_ROWS;
  const def = DEFAULT_RECRUITEE_ROW_SELECTED;
  if (cvMode === 'manual') {
    const files = uploadedFiles || [];
    return {
      selected: files.length,
      warnings: 0,
      noteLines: files.length
        ? files.map((f) => `${f.name} · ${formatFileSizeJob(f.size)}`)
        : ['No files added yet — go back to CVs.'],
    };
  }
  const sel = (rowSel && rowSel.length === rows.length) ? rowSel : def;
  const nSel = sel.filter(Boolean).length;
  const warnLines = rows.filter((c, i) => sel[i] && c.status === 'warn')
    .map((c) => `${c.name} — ${c.reason}`);
  return {
    selected: nSel,
    warnings: warnLines.length,
    noteLines: warnLines.length ? warnLines : ['No parse warnings in your current selection.'],
  };
}

const JOB_SHEET_DEMO_PIPELINE = [
  { id: 'enqueue', label: 'Queued screening workflow', sub: 'Structured payload validated; automation webhook acknowledged' },
  { id: 'fetch',   label: 'Fetching CV payloads',     sub: 'Source: Recruitee · batch download (simulated)' },
  { id: 'parse',   label: 'Parsing & text extraction', sub: 'Plain text normalized; parse warnings attached to 2 CVs' },
  { id: 'score',   label: 'Scoring against rubric',     sub: 'Must-have, nice-to-have, and red-flag criteria (simulated)' },
  { id: 'rank',    label: 'Ranking & finalizing',     sub: 'Ranked list, confidence bands, audit trail row (simulated)' },
];

function delayJob(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function JobSheetDemoOverlay({ pipeline, stepIndex, progressPct, onCancel }) {
  const allComplete = stepIndex >= pipeline.length;
  return (
    <div className="demo-run-overlay" role="dialog" aria-modal="true" aria-labelledby="job-sheet-demo-title">
      <div className="demo-run-overlay__card">
        <div className="demo-run-overlay__head">
          <div>
            <div className="mono muted" style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Demo · no backend</div>
            <h2 id="job-sheet-demo-title" className="demo-run-overlay__title">Running screening…</h2>
            <p className="demo-run-overlay__sub">
              Simulated pipeline. Rankings on the next screen are sample data until a backend returns real scores.
            </p>
          </div>
          <Btn variant="ghost" size="sm" onClick={onCancel}>Cancel</Btn>
        </div>
        <div className="demo-run-overlay__progress">
          <div className="demo-run-overlay__progress-track">
            <div className="demo-run-overlay__progress-fill" style={{ width: `${progressPct}%` }}/>
          </div>
          <span className="mono muted" style={{ fontSize: 11 }}>{progressPct}%</span>
        </div>
        <ul className="demo-run-overlay__steps" aria-live="polite">
          {pipeline.map((s, i) => {
            const done = allComplete || i < stepIndex;
            const active = !allComplete && i === stepIndex;
            return (
              <li key={s.id} className={`demo-run-overlay__step${done ? ' is-done' : ''}${active ? ' is-active' : ''}`}>
                <span className="demo-run-overlay__step-icon" aria-hidden>
                  {done ? <Icon name="check" size={12} stroke={2.6}/> : active ? <span className="demo-run-overlay__dot"/> : <span className="demo-run-overlay__dot demo-run-overlay__dot--pending"/>}
                </span>
                <div>
                  <div className="demo-run-overlay__step-label">{s.label}</div>
                  <div className="demo-run-overlay__step-sub">{s.sub}</div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function RunScreeningSheet({ profile, onClose, go }) {
  const criteria = React.useMemo(() => getCriteriaListsForProfile(profile), [profile]);
  const criteriaCount = criteria.must.length + criteria.nice.length + criteria.flag.length;
  const hasCriteria = criteriaCount > 0;

  const [step, setStep] = React.useState(1);
  const [cvMode, setCvMode] = React.useState('recruitee');
  const [recruiteeRowSelected, setRecruiteeRowSelected] = React.useState(() => [...DEFAULT_RECRUITEE_ROW_SELECTED]);
  const [uploadedFiles, setUploadedFiles] = React.useState([]);
  const [demoProcessing, setDemoProcessing] = React.useState(null);
  const demoCancelRef = React.useRef(false);
  const fileInputRef = React.useRef(null);

  React.useEffect(() => {
    setStep(1);
    setCvMode('recruitee');
    setRecruiteeRowSelected([...DEFAULT_RECRUITEE_ROW_SELECTED]);
    setUploadedFiles([]);
    setDemoProcessing(null);
    demoCancelRef.current = false;
  }, [profile.id]);

  React.useEffect(() => () => {
    demoCancelRef.current = true;
  }, []);

  const rows = RECRUITEE_APPLICANT_ROWS;
  const rowSel = (recruiteeRowSelected && recruiteeRowSelected.length === rows.length)
    ? recruiteeRowSelected
    : DEFAULT_RECRUITEE_ROW_SELECTED;
  const nSelectedRec = rowSel.filter(Boolean).length;
  const nWarnSelected = rows.filter((c, i) => rowSel[i] && c.status === 'warn').length;
  const apps = getRecruiteeAppsForProfile(profile);

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
        name: f.name,
        size: f.size,
      });
    }
    setUploadedFiles(next);
  };

  const canRun =
    hasCriteria
    && !(cvMode === 'manual' && uploadedFiles.length === 0)
    && !(cvMode === 'recruitee' && !rowSel.some(Boolean));

  const startDemoRun = React.useCallback(async () => {
    if (!canRun) return;
    demoCancelRef.current = false;
    const sel = (recruiteeRowSelected && recruiteeRowSelected.length === rows.length)
      ? recruiteeRowSelected
      : DEFAULT_RECRUITEE_ROW_SELECTED;
    const cvs = cvMode === 'manual' ? uploadedFiles.length : sel.filter(Boolean).length;
    const nParseWarn = cvMode === 'recruitee'
      ? rows.filter((c, i) => sel[i] && c.status === 'warn').length
      : 0;

    const runId = formatRunIdFromDate(new Date());
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const run = {
      id: runId,
      job: profile.name,
      profile: profile.name,
      profileId: profile.id,
      dept: profile.dept,
      date: today,
      cvs: Math.max(cvs, 1),
      scoreRange: [44, 89],
      duration: '~5s (simulated)',
      status: 'completed',
      owner: 'You',
      isDemoSynthetic: true,
    };

    const pipeline = JOB_SHEET_DEMO_PIPELINE.map((row) => {
      if (row.id === 'fetch') {
        const sub = cvMode === 'manual'
          ? `Local files only — ${uploadedFiles.length} file(s) (simulated scoring)`
          : 'Source: Recruitee · applicant documents (simulated)';
        return { ...row, sub };
      }
      if (row.id === 'parse') {
        const sub = nParseWarn > 0
          ? `Plain text normalized; ${nParseWarn} parse warning(s) in your selection`
          : 'Plain text normalized; no parse warnings in selection';
        return { ...row, sub };
      }
      return row;
    });

    setDemoProcessing({ stepIndex: 0, progressPct: 4, pipeline });
    const perStepMs = 720;
    for (let i = 0; i < pipeline.length; i++) {
      if (demoCancelRef.current) {
        setDemoProcessing(null);
        return;
      }
      setDemoProcessing({
        stepIndex: i,
        progressPct: Math.min(96, Math.round(((i + 0.35) / pipeline.length) * 100)),
        pipeline,
      });
      await delayJob(perStepMs + (i === pipeline.length - 1 ? 400 : 0));
    }
    if (demoCancelRef.current) {
      setDemoProcessing(null);
      return;
    }
    setDemoProcessing({ stepIndex: pipeline.length, progressPct: 100, pipeline });
    await delayJob(450);
    if (demoCancelRef.current) {
      setDemoProcessing(null);
      return;
    }
    try {
      const ssKey = DEMO_RUN_SESSION_KEY;
      sessionStorage.setItem(ssKey, JSON.stringify({
        runId,
        completedAt: Date.now(),
        profileName: profile.name,
        profileId: profile.id,
        cvMode,
        criteriaCount,
        run,
      }));
    } catch (_) {}
    setDemoProcessing(null);
    onClose();
    go('results', runId);
  }, [canRun, profile, cvMode, uploadedFiles, recruiteeRowSelected, criteriaCount, go, onClose, rows]);

  const cvSum = getJobSheetCvSummary(cvMode, uploadedFiles, recruiteeRowSelected);

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
              {profile.dept} · {criteriaCount} saved criteria · Rubric is read from this job (edit under Jobs → Criteria).
            </div>
          </div>
          <IconBtn name="x" size={16} onClick={onClose}/>
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          {!hasCriteria && (
            <div className="callout" style={{ marginBottom: 16 }}>
              Add at least one criterion on this job&apos;s <strong>Criteria</strong> tab before running. This keeps every screening tied to an explicit rubric.
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
                { value: 'recruitee', label: `Recruitee · ${apps} applicants` },
                { value: 'manual', label: `Upload${uploadedFiles.length ? ` · ${uploadedFiles.length} file(s)` : ''}` },
              ]}/>

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
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div className="row" style={{ gap: 8 }}>
                      <Btn size="sm" variant="ghost" onClick={() => setRecruiteeRowSelected(rows.map(() => true))}>Select all</Btn>
                      <Btn size="sm" variant="ghost" onClick={() => setRecruiteeRowSelected(rows.map(() => false))}>Clear</Btn>
                      <span className="muted mono" style={{ fontSize: 11 }}>{nSelectedRec} of {rows.length} selected</span>
                    </div>
                    {nWarnSelected > 0
                      ? <Badge tone="warn" dot>{nWarnSelected} parse warning{nWarnSelected === 1 ? '' : 's'}</Badge>
                      : <Badge tone="ok" dot>Parse clean</Badge>}
                  </div>
                  <div className="card" style={{ maxHeight: 280, overflow: 'auto' }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th style={{ width: 32 }}/>
                          <th>Applicant</th>
                          <th style={{ width: 120 }}>Location</th>
                          <th>Parse status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((c, i) => (
                          <tr
                            key={c.name}
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
                                border: `1.5px solid ${rowSel[i] ? 'var(--ink)' : 'var(--faint)'}`,
                                background: rowSel[i] ? 'var(--ink)' : 'var(--surface)',
                                borderRadius: 3, color: 'var(--bg)',
                              }}>{rowSel[i] && <Icon name="check" size={10} stroke={2.4}/>}</span>
                            </td>
                            <td><strong style={{ fontWeight: 500 }}>{c.name}</strong></td>
                            <td className="muted">{c.loc}</td>
                            <td>
                              {c.status === 'ok'
                                ? <Badge tone="ok" dot>Parsed</Badge>
                                : <span className="row" style={{ gap: 6 }}><Badge tone="warn" dot>Warning</Badge><span className="muted" style={{ fontSize: 11 }}>{c.reason}</span></span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <div className="col" style={{ gap: 12 }}>
              <div className="card">
                <div className="card__head">
                  <span className="card__title" style={{ fontSize: 12 }}>Criteria (from job)</span>
                  <span className="mono muted" style={{ fontSize: 11 }}>{criteriaCount} total</span>
                </div>
                <div className="card__body" style={{ paddingTop: 8 }}>
                  {criteria.must.length > 0 && (
                    <div className="crit-chip-stack" style={{ marginBottom: 8 }}>
                      {criteria.must.map((it) => <Chip key={it.id} kind="must" name={it.name} weight={it.weight}/>)}
                    </div>
                  )}
                  {criteria.nice.length > 0 && (
                    <div className="crit-chip-stack" style={{ marginBottom: 8 }}>
                      {criteria.nice.map((it) => <Chip key={it.id} kind="nice" name={it.name} weight={it.weight}/>)}
                    </div>
                  )}
                  {criteria.flag.length > 0 && (
                    <div className="crit-chip-stack">
                      {criteria.flag.map((it) => <Chip key={it.id} kind="flag" name={it.name} weight={it.weight}/>)}
                    </div>
                  )}
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

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
          <div className="row" style={{ gap: 8 }}>
            {step === 2 ? (
              <Btn variant="ghost" onClick={() => setStep(1)}>Back</Btn>
            ) : (
              <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            )}
            {step === 1 ? (
              <Btn variant="primary" iconRight="chevron-right" onClick={() => setStep(2)} disabled={!hasCriteria || (cvMode === 'manual' && !uploadedFiles.length) || (cvMode === 'recruitee' && !rowSel.some(Boolean))}>
                Continue
              </Btn>
            ) : (
              <Btn variant="primary" icon="play" disabled={!canRun} onClick={() => startDemoRun()}>Run now</Btn>
            )}
          </div>
        </div>
      </div>

      {demoProcessing && (
        <JobSheetDemoOverlay
          pipeline={demoProcessing.pipeline}
          stepIndex={demoProcessing.stepIndex}
          progressPct={demoProcessing.progressPct}
          onCancel={() => {
            demoCancelRef.current = true;
            setDemoProcessing(null);
          }}
        />
      )}
    </div>
  );
}

function PickJobToRunModal({ onClose, onPick }) {
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
          {PROFILES.map((p) => (
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
  const preview = typeof JOB_DESC_PREVIEW === 'string' ? JOB_DESC_PREVIEW : '';
  const description =
    job.id === 'rec-2841' && preview
      ? preview
      : `Imported from Recruitee — ${job.title} (${job.dept}).\n\n${preview ? `${preview.slice(0, 400)}…` : 'Open Overview to paste or edit the full job description.'}`;
  return {
    id: allocNewProfileId(),
    name: job.title,
    dept: job.dept,
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
  const [selectedId, setSelectedId] = React.useState(null);
  const [editorInitialTab, setEditorInitialTab] = React.useState(null);
  const [, refreshProfiles] = React.useReducer((n) => n + 1, 0);
  const [showNew, setShowNew] = React.useState(false);
  const [filter, setFilter] = React.useState('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [runSheetProfileId, setRunSheetProfileId] = React.useState(null);
  const [showRunPicker, setShowRunPicker] = React.useState(false);
  const profile = selectedId ? PROFILES.find(p => p.id === selectedId) : null;

  const openRunJobId = route && route.openRunJobId;

  React.useEffect(() => {
    if (!openRunJobId || !PROFILES.some((p) => p.id === openRunJobId)) return;
    setRunSheetProfileId(openRunJobId);
    setSelectedId(null);
    if (typeof history !== 'undefined' && String(location.hash).includes('job=')) {
      try {
        history.replaceState(null, '', '#profiles');
      } catch (_) {}
    }
  }, [openRunJobId]);

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
          />
        )}
      </>
    );
  }

  const runSheetProfile = runSheetProfileId ? PROFILES.find((p) => p.id === runSheetProfileId) : null;

  const filtered = PROFILES.filter(p => {
    const q = searchQuery.trim().toLowerCase();
    if (q && !p.name.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q)) return false;
    if (filter === 'all') return true;
    if (filter === 'open') return p.status === 'open';
    if (filter === 'closed') return p.status === 'closed';
    if (filter === 'recruitee') return p.source === 'recruitee';
    if (filter === 'manual') return p.source === 'manual';
    return true;
  });

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="page__eyebrow">Jobs</div>
          <h1 className="page__title">Jobs</h1>
          <div className="page__sub">
            Configure each job here (description, criteria, runs). Use <strong>Run screening</strong> on a job to choose CVs against its saved rubric.
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="default" icon="database">Sync from Recruitee</Btn>
          <Btn variant="default" icon="play" onClick={() => setShowRunPicker(true)}>Run screening…</Btn>
          <Btn variant="primary" icon="plus" onClick={() => setShowNew(true)}>New job</Btn>
        </div>
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
          { value: 'all',       label: `All ${PROFILES.length}` },
          { value: 'open',      label: 'Open' },
          { value: 'closed',    label: 'Closed' },
          { value: 'recruitee', label: 'From Recruitee' },
          { value: 'manual',    label: 'Manually added' },
        ]}/>
        <div className="spacer"/>
        <Btn icon="archive" variant="ghost" size="sm">Archived</Btn>
      </div>

      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Job announcement</th>
              <th style={{ width: 112 }}>Posted</th>
              <th style={{ width: 120 }}>Source</th>
              <th style={{ width: 130 }}>Department</th>
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
                <tr key={p.id} onClick={() => { setRunSheetProfileId(null); setEditorInitialTab(null); setSelectedId(p.id); }}>
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
                  <td className="muted">{p.dept}</td>
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
          {filtered.length} of {PROFILES.length} jobs · synced from Recruitee 4 min ago
        </div>
        <div className="row" style={{ gap: 4 }}>
          <Btn variant="ghost" size="sm" icon="chevron-left">Prev</Btn>
          <Btn variant="ghost" size="sm" iconRight="chevron-right">Next</Btn>
        </div>
      </div>

      {showNew && (
        <NewProfileDialog
          onClose={() => setShowNew(false)}
          onCreate={(newProfile) => {
            PROFILES.push(newProfile);
            refreshProfiles();
            setShowNew(false);
            setEditorInitialTab('criteria');
            setSelectedId(newProfile.id);
          }}
        />
      )}
      {showRunPicker && (
        <PickJobToRunModal
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
function NewProfileDialog({ onClose, onCreate }) {
  const [mode, setMode] = React.useState('recruitee');
  const [picked, setPicked] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [desc, setDesc] = React.useState('');

  const recruiteeRefsInCaliper = React.useMemo(
    () => new Set(PROFILES.filter((p) => p.source === 'recruitee' && p.sourceRef).map((p) => p.sourceRef)),
    [],
  );
  const recruiteeChoices = React.useMemo(
    () => RECRUITEE_JOBS.filter((j) => !recruiteeRefsInCaliper.has(j.id)),
    [recruiteeRefsInCaliper],
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
      const job = RECRUITEE_JOBS.find((j) => j.id === picked);
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
                    <option key={j.id} value={j.id}>{j.title} — {j.dept} ({j.apps} applicants)</option>
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

function ProfileEditor({ profile, initialTab, onBack, go, onOpenRunSheet }) {
  const isHero = profile.id === HERO_PROFILE.id;
  const [mh, setMHState] = React.useState(() => cloneCriteriaItems(profile.mustHave));
  const [nh, setNHState] = React.useState(() => cloneCriteriaItems(profile.niceToHave));
  const [rf, setRFState] = React.useState(() => cloneCriteriaItems(profile.redFlags));
  const [desc, setDescState] = React.useState(() => profile.description || '');
  const [showBias, setShowBias] = React.useState(false);
  const totalCriteria = mh.length + nh.length + rf.length;

  React.useLayoutEffect(() => {
    const mh0 = cloneCriteriaItems(profile.mustHave);
    const nh0 = cloneCriteriaItems(profile.niceToHave);
    const rf0 = cloneCriteriaItems(profile.redFlags);
    const d0 = profile.description || '';
    setMHState(mh0);
    setNHState(nh0);
    setRFState(rf0);
    setDescState(d0);
    profile.mustHave = mh0;
    profile.niceToHave = nh0;
    profile.redFlags = rf0;
    profile.description = d0;
  }, [profile.id]);

  const setMH = React.useCallback((up) => {
    setMHState((prev) => {
      const next = typeof up === 'function' ? up(prev) : up;
      profile.mustHave = next;
      return next;
    });
  }, [profile]);

  const setNH = React.useCallback((up) => {
    setNHState((prev) => {
      const next = typeof up === 'function' ? up(prev) : up;
      profile.niceToHave = next;
      return next;
    });
  }, [profile]);

  const setRF = React.useCallback((up) => {
    setRFState((prev) => {
      const next = typeof up === 'function' ? up(prev) : up;
      profile.redFlags = next;
      return next;
    });
  }, [profile]);

  const setDesc = React.useCallback((up) => {
    setDescState((prev) => {
      const next = typeof up === 'function' ? up(prev) : up;
      profile.description = next;
      return next;
    });
  }, [profile]);

  // Mock runs against this profile
  const profileRuns = RUNS.filter(r => r.profile && r.profile.includes(profile.name.split(',')[0].slice(0, 12)))
    .slice(0, 3);
  const fallbackRuns = [
    { id: '12052026', date: 'May 12, 2026', cvs: 38, scoreRange: [42, 91], status: 'completed', duration: '4m 12s', owner: 'You' },
    { id: '30042026', date: 'Apr 30, 2026', cvs: 24, scoreRange: [38, 87], status: 'completed', duration: '3m 04s', owner: 'Mara Achterberg' },
    { id: '18042026', date: 'Apr 18, 2026', cvs: 19, scoreRange: [45, 83], status: 'completed', duration: '2m 41s', owner: 'You' },
  ];
  const runsToShow = isHero ? fallbackRuns : profileRuns.length ? profileRuns : [];

  return (
    <div className="page">
      <div className="page__head" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="page__eyebrow">
            <button type="button" className="linkish" onClick={onBack}>← Jobs</button>
            <span style={{ margin: '0 8px', color: 'var(--faint)' }}>·</span>
            <span className="mono">{profile.id}</span>
          </div>
          <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 6 }}>
            <h1 className="page__title" style={{ margin: 0 }}>{profile.name}</h1>
            {profile.source === 'recruitee'
              ? <Badge tone="info"><Icon name="database" size={11}/> Recruitee · {profile.sourceRef}</Badge>
              : <Badge tone="ghost"><Icon name="edit" size={11}/> Manually added</Badge>}
            <Badge tone={profile.status === 'open' ? 'ok' : 'ghost'} dot={profile.status === 'open'}>
              {profile.status === 'open' ? 'Open' : profile.status === 'closed' ? 'Closed' : 'Archived'}
            </Badge>
          </div>
          <div className="page__sub">
            {profile.dept} · posted {profile.postedOn} · {profile.runsCount || 0} screening {profile.runsCount === 1 ? 'run' : 'runs'} · last updated {profile.lastUpdated}
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" icon="copy">Duplicate</Btn>
          <Btn variant="ghost" icon="archive">Archive</Btn>
          <Btn variant="primary" icon="play" onClick={() => onOpenRunSheet && onOpenRunSheet()}>Run screening</Btn>
        </div>
      </div>

      {/* Tabbed: Overview · Criteria · Runs · Audit */}
      <ProfileTabs
        profile={profile}
        initialTab={initialTab}
        desc={desc} setDesc={setDesc}
        mh={mh} setMH={setMH}
        nh={nh} setNH={setNH}
        rf={rf} setRF={setRF}
        runsToShow={runsToShow}
        showBias={showBias} setShowBias={setShowBias}
        totalCriteria={totalCriteria}
        go={go}
        onOpenRunSheet={onOpenRunSheet}
      />
    </div>
  );
}

function ProfileTabs({ profile, initialTab, desc, setDesc, mh, setMH, nh, setNH, rf, setRF, runsToShow, showBias, setShowBias, totalCriteria, go, onOpenRunSheet }) {
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

  return (
    <>
      <div className="row" style={{ marginBottom: 18, borderBottom: '1px solid var(--line)', gap: 0 }} role="tablist" aria-label="Job sections">
        <TabBtn label="Overview"  count={null}            active={tab === 'overview'} onClick={() => setTab('overview')}/>
        <TabBtn label="Criteria"  count={totalCriteria}   active={tab === 'criteria'} onClick={() => setTab('criteria')}/>
        <TabBtn label="Runs"      count={runsToShow.length} active={tab === 'runs'}   onClick={() => setTab('runs')}/>
        <TabBtn label="Candidates" count={candidateRows.length} active={tab === 'candidates'} onClick={() => setTab('candidates')}/>
        <TabBtn label="Audit"     count={AUDIT.length}    active={tab === 'audit'}    onClick={() => setTab('audit')}/>
      </div>

      {tab === 'overview' && (
        <OverviewPane
          profile={profile}
          desc={desc}
          setDesc={setDesc}
          mh={mh}
          nh={nh}
          rf={rf}
          runsToShow={runsToShow}
          go={go}
          onGoToCriteria={() => setTab('criteria')}
        />
      )}
      {tab === 'criteria' && <CriteriaPane mh={mh} setMH={setMH} nh={nh} setNH={setNH} rf={rf} setRF={setRF} showBias={showBias} setShowBias={setShowBias}/>}
      {tab === 'runs'     && <RunsPane runs={runsToShow} go={go} onOpenRunSheet={onOpenRunSheet}/>}
      {tab === 'candidates' && (
        <JobCandidatesPane
          rows={candidateRows}
          completedRuns={completedRunsForJob}
          go={go}
          onOpenRunSheet={onOpenRunSheet}
        />
      )}
      {tab === 'audit'    && <AuditPane/>}
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

/* ----- Overview pane ----- */
function OverviewPane({ profile, desc, setDesc, mh, nh, rf, runsToShow, go, onGoToCriteria }) {
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
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
                {desc}
              </div>
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
              <span style={{ fontSize: 12.5 }}>{profile.postedOn}</span>
            </div>
            <div className="row" style={{ gap: 12, marginBottom: 10 }}>
              <span className="muted mono" style={{ fontSize: 11, width: 80 }}>Department</span>
              <span style={{ fontSize: 12.5 }}>{profile.dept}</span>
            </div>
            <div className="row" style={{ gap: 12, marginBottom: 10 }}>
              <span className="muted mono" style={{ fontSize: 11, width: 80 }}>Source</span>
              <span style={{ fontSize: 12.5 }}>
                {profile.source === 'recruitee' ? `Recruitee · ${profile.sourceRef}` : 'Manually added'}
              </span>
            </div>
            <div className="row" style={{ gap: 12 }}>
              <span className="muted mono" style={{ fontSize: 11, width: 80 }}>Last edit</span>
              <span style={{ fontSize: 12.5 }}>{profile.lastUpdated}</span>
            </div>
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

/* ----- Criteria pane ----- */
function CriteriaPane({ mh, setMH, nh, setNH, rf, setRF, showBias, setShowBias }) {
  const [biasPending, setBiasPending] = React.useState(null);
  return (
    <div className="col" style={{ gap: 16 }}>
      <CriteriaList kind="must" label="Must-have criteria"
        help="If Claude can't find evidence for these, the candidate falls in the ranking — heavily."
        items={mh} setItems={setMH}/>
      <CriteriaList kind="nice" label="Nice-to-have"
        help="Boosts when matched. Doesn't penalise when missing."
        items={nh} setItems={setNH}/>
      <CriteriaList kind="flag" label="Red flags"
        help="If matched, the candidate is marked Flagged and surfaced for manual review. Use sparingly."
        items={rf} setItems={setRF}
        onBiasWarn={(payload) => { setBiasPending(payload); setShowBias(true); }}/>
      {showBias && (
        <div className="bias-banner">
          <Icon name="alert" size={16} className="bias-banner__icon"/>
          <div>
            <div className="bias-banner__title">This criterion may correlate with demographic bias.</div>
            <div className="bias-banner__body">
              Patterns like “employment gaps,” “frequent short tenures,” or “non-linear career paths” are commonly associated with protected characteristics — caregivers returning to work, candidates in volatile labour markets, etc. Consider whether you've evidence this is genuinely predictive for the role. The platform doesn't block the criterion, but the warning is recorded in the audit trail.
              <div className="row" style={{ marginTop: 10, gap: 8 }}>
                <Btn size="sm" variant="default" onClick={() => {
                  if (!biasPending) return;
                  setRF((prev) => [...prev, { id: 'x' + Date.now(), name: biasPending.name, weight: biasPending.weight }]);
                  setBiasPending(null);
                  setShowBias(false);
                }}>Add anyway (logged)</Btn>
                <Btn size="sm" variant="ghost" onClick={() => { setBiasPending(null); setShowBias(false); }}>Don't add</Btn>
              </div>
            </div>
          </div>
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
              A weight of <strong>×1</strong> means the criterion contributes its base value to the score. A weight of <strong>×5</strong> means it contributes <em>five</em> times that.
            </div>
            <div className="muted" style={{ fontSize: 12.5, maxWidth: '54ch' }}>
              This lets <em>“500+ interviews conducted”</em> matter substantially more than <em>“familiar with Google Sheets”</em>, rather than every criterion being equal.
            </div>
          </div>
          <div className="col" style={{ gap: 4, minWidth: 200 }}>
            {[1, 2, 3, 4, 5].map(w => (
              <div key={w} className="row" style={{ gap: 8 }}>
                <span className="mono muted" style={{ width: 24, fontSize: 11 }}>×{w}</span>
                <span style={{
                  height: 6, borderRadius: 3,
                  background: 'var(--ink)',
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

/* ----- Candidates across completed runs ----- */
function JobCandidatesPane({ rows, completedRuns, go, onOpenRunSheet }) {
  const uniquePeople = React.useMemo(() => {
    const s = new Set();
    rows.forEach((r) => s.add(r.name.toLowerCase()));
    return s.size;
  }, [rows]);

  if (completedRuns.length === 0) {
    return (
      <div className="card">
        <div className="empty">
          <Icon name="users" size={22}/>
          <div style={{ marginTop: 8, fontSize: 14, color: 'var(--ink)' }}>No screened candidates yet</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 4, maxWidth: '48ch' }}>
            When you have at least one <strong>completed</strong> run for this job, every scored candidate from those runs appears here (one row per person per run; a backend can merge duplicates across runs).
          </div>
          <div style={{ marginTop: 16 }}>
            <Btn variant="primary" icon="play" onClick={() => onOpenRunSheet && onOpenRunSheet()}>Run screening</Btn>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
        <strong>{rows.length}</strong> scored candidate row{rows.length === 1 ? '' : 's'} across{' '}
        <strong>{completedRuns.length}</strong> completed run{completedRuns.length === 1 ? '' : 's'}
        {uniquePeople > 0 && (
          <>
            {' · '}
            <span className="mono">{uniquePeople}</span> distinct names in this mock
          </>
        )}
        . Click a row to open the candidate detail drawer (or the run only when no candidate id is linked).
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
    </div>
  );
}

/* ----- Audit pane ----- */
function AuditPane() {
  return (
    <div className="card">
      <div className="card__head">
        <Icon name="history" size={14} className="muted"/>
        <span className="card__title">Audit trail</span>
        <div className="spacer"/>
        <span className="mono muted" style={{ fontSize: 11 }}>{AUDIT.length} entries</span>
        <Btn size="sm" variant="ghost" icon="download">Export log</Btn>
      </div>
      <div className="card__body" style={{ paddingTop: 4 }}>
        <div className="log">
          {AUDIT.map((a, i) => (
            <div key={i} className="log__row">
              <div className="log__ts">{a.ts}</div>
              <div className="log__msg">
                <b>{a.who}</b> {a.msg}
                {a.warned && (
                  <span className="ml-2 inline-flex items-center rounded-full border border-transparent bg-amber-50 px-2 py-0.5 text-[10px] font-medium leading-none text-amber-800">
                    Bias notice shown
                  </span>
                )}
                {a.reason !== '—' && <div><em>Reason: {a.reason}</em></div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ----- Criteria list (shared) ----- */
const BIAS_PATTERNS = /tenure|gap|short|non[- ]linear|career break|young|old/i;

function CriteriaList({ kind, label, help, items, setItems, onBiasWarn }) {
  const [input, setInput] = React.useState('');
  const [weight, setWeight] = React.useState(3);

  const add = () => {
    if (!input.trim()) return;
    if (kind === 'flag' && BIAS_PATTERNS.test(input) && onBiasWarn) {
      onBiasWarn({ name: input.trim(), weight });
      return;
    }
    setItems([...items, { id: 'x' + Date.now(), name: input.trim(), weight }]);
    setInput('');
  };
  const remove = (id) => setItems(items.filter(x => x.id !== id));
  const setWeightFor = (id, w) => setItems(items.map(x => x.id === id ? { ...x, weight: w } : x));

  return (
    <div className="crit-list">
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
                 value={input} onChange={(e) => setInput(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && add()}
                 style={{ flex: 1 }}/>
          <div className="row" style={{ gap: 4 }}>
            <span className="mono muted" style={{ fontSize: 11 }}>weight</span>
            <WeightStepper value={weight} onChange={setWeight}/>
          </div>
          <Btn icon="plus" onClick={add}>Add</Btn>
        </div>
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
