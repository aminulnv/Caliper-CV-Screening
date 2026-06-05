// @ts-nocheck
// Page — Run results for /runs/:runId
import React from 'react'
import { Icon, Btn, IconBtn, Segmented, ScoreBar, Confidence, StatusBadge } from '@/caliper/ui'
import { api } from '@/services/api'
import type { RunDetail, CandidateRow, CandidateEvaluationResponse, EvaluationItem } from '@/services/api'
import { CriteriaChecklistPanel, ChecklistSummary } from '@/caliper/components/CriteriaChecklist'
import { CvViewer } from '@/caliper/components/CvViewer'
import { CvQuotesPanel } from '@/caliper/components/CvQuotesPanel'
import { countsFromCandidateRow } from '@/lib/criteria-checklist'

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
  };
}

function ScoreDeductionBreakdown({ candidate }) {
  const { criteriaMetPct, scoreBase, penaltyFlag } = candidateMetrics(candidate);
  const pct = criteriaMetPct ?? scoreBase;
  if (pct == null) return null;
  const flagPen = penaltyFlag;
  const final = candidate.score ?? 0;
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

function ResultsPage({ tweaks, route, go }) {
  const runId = route?.runId ?? route?.run;

  React.useEffect(() => {
    if (!runId && typeof go === 'function') go('runs');
  }, [runId, go]);

  const [run, setRun] = React.useState<RunDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [sortBy, setSortBy] = React.useState('score');
  const [filterStatus, setFilterStatus] = React.useState('all');

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

  React.useEffect(() => { setSelected(null); }, [runId]);

  if (!runId) return null;
  if (loading) return <div className="page"><div className="muted" style={{ padding: 32 }}>Loading results…</div></div>;
  if (error) return <div className="page"><div style={{ color: 'var(--bad)', padding: 32 }}>{error}</div></div>;
  if (!run) return null;

  const candidates = run.candidates ?? [];

  const rows = candidates
    .filter((c) => filterStatus === 'all' || c.status === filterStatus)
    .slice()
    .sort((a, b) =>
      sortBy === 'confidence'
        ? confOrder(b.confidence) - confOrder(a.confidence)
        : (b.score ?? 0) - (a.score ?? 0)
    );

  const nStrong = candidates.filter((c) => c.status === 'strong').length;
  const nPromising = candidates.filter((c) => c.status === 'promising').length;
  const nReviewOrFlag = candidates.filter((c) => c.status === 'review' || c.status === 'flagged').length;
  const meanConfPct = candidates.length
    ? Math.round((candidates.reduce((s, c) => s + confOrder(c.confidence), 0) / candidates.length / 3) * 100)
    : 0;

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
        <Btn variant="ghost" icon="download" size="sm" onClick={exportCsv}>Export CSV</Btn>
        <Btn variant="default" icon="copy" onClick={() => go && go('profiles', { job: run.job_id })}>Re-run</Btn>
      </div>

      <div className="stats stats--4" style={{ marginBottom: 22 }}>
        <StatCell label="Strong matches"    value={String(nStrong)}      sub="≥ 85"                    tone="ok"/>
        <StatCell label="Promising"         value={String(nPromising)}   sub="65 – 84"                 tone="info"/>
        <StatCell label="Review / flagged"  value={String(nReviewOrFlag)} sub="parse warnings / flags" tone="warn"/>
        <StatCell label="Mean confidence"   value={`${meanConfPct}%`}   sub="across all criteria"     tone="default"/>
      </div>

      <div className="row" style={{ marginBottom: 16, borderBottom: '1px solid var(--line)', gap: 0, alignItems: 'center', paddingBottom: 6 }}>
        <span className="mono muted" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Ranked list</span>
        <div className="spacer"/>
        <div className="row" style={{ gap: 8 }}>
          <span className="mono muted" style={{ fontSize: 11 }}>Sort</span>
          <Segmented value={sortBy} onChange={setSortBy} options={[
            { value: 'score', label: 'Score' },
            { value: 'confidence', label: 'Confidence' },
          ]}/>
          <span className="mono muted" style={{ fontSize: 11, marginLeft: 8 }}>Status</span>
          <select className="sel" style={{ height: 30, padding: '0 10px', fontSize: 12 }}
                  value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="strong">Strong match</option>
            <option value="promising">Promising</option>
            <option value="review">Review manually</option>
            <option value="flagged">Flagged</option>
          </select>
        </div>
      </div>

      <RankedList rows={rows} onOpen={setSelected} tweaks={tweaks}/>

      {selected && (
        <CandidateDetail
          candidateId={selected}
          runId={run.id}
          allCandidates={candidates}
          onClose={() => setSelected(null)}
          onCandidateChange={setSelected}
          tweaks={tweaks}
        />
      )}
    </div>
  );
}

const StatCell = ({ label, value, sub, tone }) => (
  <div className="stats__cell">
    <div className="stats__lbl">{label}</div>
    <div className="stats__val" style={{
      color: tone === 'ok' ? 'var(--ok-ink)' : tone === 'warn' ? 'var(--warn-ink)' : tone === 'info' ? 'oklch(0.42 0.10 245)' : undefined
    }}>{value}</div>
    {sub && <div className="stats__delta">· {sub}</div>}
  </div>
);

function RankedList({ rows, onOpen, tweaks }) {
  if (rows.length === 0) {
    return <div className="card"><div className="muted" style={{ textAlign: 'center', padding: 32 }}>No candidates yet.</div></div>;
  }
  return (
    <div className="card">
      <table className="tbl">
        <thead>
          <tr>
            <th style={{ width: 36 }}/>
            <th style={{ width: 56 }}>Rank</th>
            <th>Candidate</th>
            <th style={{ width: 88 }}>% met</th>
            <th style={{ width: 200 }}>Score</th>
            <th style={{ width: 100 }}>Confidence</th>
            <th style={{ width: 160 }}>Status</th>
            <th style={{ width: 36 }}/>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => {
            const m = candidateMetrics(c);
            return (
            <tr key={c.id} onClick={() => onOpen(c.id)} className="is-clickable">
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
              <td><Confidence level={c.confidence}/></td>
              <td><StatusBadge s={c.status}/></td>
              <td><Icon name="chevron-right" size={14} className="muted"/></td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CandidateDetail({ candidateId, runId, allCandidates, onClose, onCandidateChange, tweaks }) {
  const [evalData, setEvalData] = React.useState<CandidateEvaluationResponse | null>(null);
  const [evalLoading, setEvalLoading] = React.useState(true);
  const [decisions, setDecisions] = React.useState<Record<string, 'agree' | 'override' | null>>({});
  const [overrideModal, setOverrideModal] = React.useState<{ evalId: string; currentMet: boolean | null } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [cvLink, setCvLink] = React.useState(null);

  React.useEffect(() => {
    setEvalLoading(true);
    setDecisions({});
    setCvLink(null);
    api.candidates.getEvaluation(candidateId)
      .then(setEvalData)
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
      await api.candidates.override(evalId, met, note);
      // Optimistic UI: flip the evaluation locally
      setEvalData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          evaluations: prev.evaluations.map((e) =>
            e.id === evalId ? { ...e, met, override_note: note, overridden_by: 'you' } : e
          ),
        };
      });
      setDecisions((d) => ({ ...d, [evalId]: 'override' }));
    } finally {
      setSaving(false);
      setOverrideModal(null);
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
                  onAgree={(id) => setDecisions((d) => ({ ...d, [id]: 'agree' }))}
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
