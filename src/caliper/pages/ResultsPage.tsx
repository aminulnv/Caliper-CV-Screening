// @ts-nocheck
// Page — Run results for /runs/:runId
import React from 'react'
import { Icon, Btn, IconBtn, Segmented, ScoreBar, Confidence, StatusBadge } from '@/caliper/ui'
import { api } from '@/services/api'
import type { RunDetail, CandidateRow, CandidateEvaluationResponse, EvaluationItem, CompareRunResponse } from '@/services/api'
import { CriteriaChecklistPanel, ChecklistSummary } from '@/caliper/components/CriteriaChecklist'
import { CandidateCompareSheet } from '@/caliper/components/CandidateCompareSheet'
import { CandidateHistoryPanel } from '@/caliper/components/CandidateHistoryPanel'
import { CvViewer } from '@/caliper/components/CvViewer'
import { CvQuotesPanel } from '@/caliper/components/CvQuotesPanel'
import { countsFromCandidateRow } from '@/lib/criteria-checklist'
import { RunAccessControl } from '@/caliper/components/RunAccessControl'
import { useAuth } from '@/contexts/AuthContext'
import type { WorkspaceMember } from '@/services/api'

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

const MAX_COMPARE = 4;

function matchesStatusFilter(candidate, filterStatus) {
  if (filterStatus === 'all') return true;
  if (filterStatus === 'review_flagged') {
    return candidate.status === 'review' || candidate.status === 'flagged';
  }
  return candidate.status === filterStatus;
}

function ResultsPage({ tweaks, route, go }) {
  const { displayName, avatarUrl, user } = useAuth();
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
  const [sortBy, setSortBy] = React.useState('score');
  const [filterStatus, setFilterStatus] = React.useState('all');
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
    setShareOpen(false);
  }, [runId]);

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

    let nextIds;
    let rollback;

    setRun((prev) => {
      if (!prev) return prev;

      const current = Array.isArray(prev.shared_user_ids) ? prev.shared_user_ids : [];
      const currentShared = Array.isArray(prev.shared_users) ? prev.shared_users : [];
      rollback = { shared_user_ids: current, shared_users: currentShared };

      const isRemoving = current.some((id) => String(id) === String(member.user_id));
      nextIds = isRemoving
        ? current.filter((id) => String(id) !== String(member.user_id))
        : [...current, member.user_id];
      const nextShared = isRemoving
        ? currentShared.filter((u) => (u.user_id ?? u.userId) !== member.user_id)
        : [...currentShared, {
            user_id: member.user_id,
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

  if (!runId) return null;
  if (loading) return <div className="page"><div className="muted" style={{ padding: 32 }}>Loading results…</div></div>;
  if (error) return <div className="page"><div style={{ color: 'var(--bad)', padding: 32 }}>{error}</div></div>;
  if (!run) return null;

  const candidates = run.candidates ?? [];

  const rows = candidates
    .filter((c) => matchesStatusFilter(c, filterStatus))
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
        <Btn variant="default" icon="copy" onClick={() => go && go('profiles', { job: run.job_id })}>Re-run</Btn>
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
            <option value="review_flagged">Review / flagged</option>
            <option value="review">Review manually</option>
            <option value="flagged">Flagged</option>
          </select>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 10, gap: 8, alignItems: 'center' }}>
        <span className="muted" style={{ fontSize: 12 }}>
          {compareSelection.length === 0
            ? 'Select 2–4 candidates to compare'
            : `${compareSelection.length} selected for compare${compareSelection.length >= MAX_COMPARE ? ' (max)' : ''}`}
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
        onOpen={setSelected}
        tweaks={tweaks}
        compareSelection={compareSelection}
        maxCompare={MAX_COMPARE}
        onToggleCompare={toggleCompareSelect}
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
          onCandidateUpdated={(updated, scoreRange) => {
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
          }}
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

function RankedList({ rows, onOpen, tweaks, compareSelection = [], maxCompare = 4, onToggleCompare }) {
  if (rows.length === 0) {
    return <div className="card"><div className="muted" style={{ textAlign: 'center', padding: 32 }}>No candidates yet.</div></div>;
  }
  const atMax = compareSelection.length >= maxCompare;
  return (
    <div className="card">
      <table className="tbl">
        <thead>
          <tr>
            <th className="compare-select-cell" style={{ width: 36 }} aria-label="Compare selection"/>
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
            const isCompareSelected = compareSelection.includes(c.id);
            const compareDisabled = !isCompareSelected && atMax;
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

function CandidateDetail({ candidateId, runId, allCandidates, onClose, onCandidateChange, onCandidateUpdated, tweaks, go }) {
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
