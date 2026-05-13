// @ts-nocheck
// Page — Run results for /runs/:runId
import React from 'react'
import {
  getRunById,
  CANDIDATES,
  RUNS,
  HERO_PROFILE,
  CANDIDATE_EVAL,
  DEMO_RUN_SESSION_KEY,
} from '@/caliper/data'
import {
  Icon,
  Btn,
  IconBtn,
  Segmented,
  ScoreBar,
  Confidence,
  StatusBadge,
} from '@/caliper/ui'

function ResultsPage({ tweaks, route, go }) {
  React.useEffect(() => {
    if (!route || !route.runId) {
      if (typeof go === 'function') go('runs');
    }
  }, [route, go]);

  if (!route || !route.runId) {
    return null;
  }

  const run = route.run || getRunById(route.runId);
  const [selected, setSelected] = React.useState(null);
  const [sortBy, setSortBy] = React.useState('score');
  const [filterStatus, setFilterStatus] = React.useState('all');
  const [demoWalkthrough, setDemoWalkthrough] = React.useState(null);

  React.useEffect(() => {
    const key = DEMO_RUN_SESSION_KEY;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      const data = JSON.parse(raw);
      const fresh = data.completedAt && Date.now() - data.completedAt < 15 * 60 * 1000;
      if (data && data.runId === run.id && fresh) setDemoWalkthrough(data);
    } catch (_) {}
  }, [run.id]);

  React.useEffect(() => {
    setSelected(null);
  }, [run.id]);

  React.useEffect(() => {
    const cid = route && route.candidateId;
    if (!cid) return;
    if (CANDIDATES.some((c) => c.id === cid)) {
      setSelected(cid);
    }
  }, [route.candidateId, run.id]);

  const dismissDemoWalkthrough = () => {
    const key = DEMO_RUN_SESSION_KEY;
    try { sessionStorage.removeItem(key); } catch (_) {}
    setDemoWalkthrough(null);
  };

  const rows = CANDIDATES
    .filter(c => filterStatus === 'all' || c.status === filterStatus)
    .slice()
    .sort((a, b) => sortBy === 'confidence'
      ? confOrder(b.confidence) - confOrder(a.confidence)
      : b.score - a.score);

  const nStrong = CANDIDATES.filter(c => c.status === 'strong').length;
  const nPromising = CANDIDATES.filter(c => c.status === 'promising').length;
  const nReviewOrFlag = CANDIDATES.filter(c => c.status === 'review' || c.status === 'flagged').length;
  const meanConfidencePct = Math.round(
    (CANDIDATES.reduce((sum, c) => sum + confOrder(c.confidence), 0) / CANDIDATES.length / 3) * 100,
  );

  const eyebrowStatus = run.status === 'completed'
    ? <>Completed {run.date} · {run.duration}</>
    : run.status === 'in_progress'
      ? <>In progress · {run.progress ?? 0}%</>
      : run.status === 'failed'
        ? <span style={{ color: 'var(--bad-ink)' }}>Failed{run.error ? ` · ${run.error}` : ''}</span>
        : <>{run.date}</>;

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Rank', 'Name', 'Title', 'Location', 'Score', 'Confidence', 'Status'];
    const body = rows.map((c, i) => [
      i + 1, c.name, c.title, c.loc, c.score, c.confidence, c.status,
    ].map(esc).join(','));
    const csv = [header.join(','), ...body].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${run.id.replace(/[^a-z0-9-_]/gi, '_')}-candidates.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page" style={{ maxWidth: 1320 }}>
      {demoWalkthrough && (
        <div className="demo-results-banner" role="status">
          <Icon name="info" size={14} className="demo-results-banner__icon"/>
          <div className="demo-results-banner__text">
            <strong>Demo run finished.</strong>{' '}
            You just walked through the simulated pipeline for <em>{demoWalkthrough.profileName}</em>
            {demoWalkthrough.criteriaCount != null && (
              <> · {demoWalkthrough.criteriaCount} criteria in the payload</>
            )}
            . Rankings and detailed evaluation below are representative sample data (same for every completed demo).
          </div>
          <Btn variant="ghost" size="sm" onClick={dismissDemoWalkthrough}>Dismiss</Btn>
        </div>
      )}
      <div className="page__head">
        <div>
          <div className="page__eyebrow">
            <span className="mono">{run.id}</span>
            <span style={{ margin: '0 8px', color: 'var(--faint)' }}>·</span>
            {eyebrowStatus}
          </div>
          <h1 className="page__title">{run.job}</h1>
          <div className="page__sub">
            {run.cvs} CVs scored for <em>{run.job}</em>. Click any candidate for the structured evaluation, sourced quotes, and to record agree/override.
            {run.isDemoSynthetic ? (
              <span className="muted"> Ranked applicants below are fixed UI sample data until a backend returns real scores for this job.</span>
            ) : (
              !run.isHero && (
                <span className="muted"> Sample rankings match the demo run; connect a backend to load real scores per run.</span>
              )
            )}
          </div>
        </div>
        <div className="row">
          <Btn variant="ghost" icon="chevron-left" size="sm" onClick={() => go && go('runs')}>All runs</Btn>
          <Btn variant="ghost" icon="download" size="sm" onClick={exportCsv}>Export CSV</Btn>
          <Btn variant="ghost" icon="doc" size="sm" onClick={() => window.print()}>PDF reports</Btn>
          <Btn variant="default" icon="copy" onClick={() => {
            if (!go) return;
            const pid = run.profileId || (RUNS.find((x) => x.id === run.id) || {}).profileId;
            if (pid) go('profiles', { job: pid });
            else go('profiles');
          }}>Re-run</Btn>
        </div>
      </div>

      {/* run summary strip */}
      <div className="stats stats--4" style={{ marginBottom: 22 }}>
        <StatCell label="Strong matches" value={String(nStrong)} sub="≥ 85" tone="ok"/>
        <StatCell label="Promising"      value={String(nPromising)} sub="65 – 84" tone="info"/>
        <StatCell label="Review / flagged" value={String(nReviewOrFlag)} sub="parse warnings or red flags" tone="warn"/>
        <StatCell label="Mean confidence" value={`${meanConfidencePct}%`} sub="across all criteria" tone="default"/>
      </div>

      {/* Ranked list toolbar */}
      <div className="row" style={{ marginBottom: 16, borderBottom: '1px solid var(--line)', gap: 0, alignItems: 'center', paddingBottom: 6 }} role="toolbar" aria-label="Ranked list">
        <span className="mono muted" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Ranked list</span>
        <div className="spacer"/>
        <div className="row" style={{ gap: 8 }}>
          <span className="mono muted" style={{ fontSize: 11 }}>Sort</span>
          <Segmented value={sortBy} onChange={setSortBy} options={[
            { value: 'score',      label: 'Score' },
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

      <RankedList
        rows={rows}
        onOpen={(id) => {
          setSelected(id);
          if (go) go('results', { run: run.id, candidate: id });
        }}
        tweaks={tweaks}
      />

      {selected && (
        <CandidateDetail
          candidateId={selected}
          runId={run.id}
          onClose={() => {
            setSelected(null);
            if (go) go('results', run.id);
          }}
          onCandidateChange={(id) => {
            setSelected(id);
            if (go) go('results', { run: run.id, candidate: id });
          }}
          tweaks={tweaks}
        />
      )}
    </div>
  );
}

const confOrder = (c) => c === 'high' ? 3 : c === 'medium' ? 2 : 1;

const StatCell = ({ label, value, sub, tone }) => (
  <div className="stats__cell">
    <div className="stats__lbl">{label}</div>
    <div className="stats__val" style={{
      color: tone === 'ok' ? 'var(--ok-ink)' :
             tone === 'warn' ? 'var(--warn-ink)' :
             tone === 'info' ? 'oklch(0.42 0.10 245)' : undefined
    }}>{value}</div>
    {sub && <div className="stats__delta">· {sub}</div>}
  </div>
);

/* ----- Ranked list table ----- */
function RankedList({ rows, onOpen, tweaks }) {
  return (
    <div className="card">
      <table className="tbl">
        <thead>
          <tr>
            <th style={{ width: 36 }}/>
            <th style={{ width: 56 }}>Rank</th>
            <th>Candidate</th>
            <th style={{ width: 220 }}>Score</th>
            <th style={{ width: 100 }}>Confidence</th>
            <th style={{ width: 160 }}>Status</th>
            <th style={{ width: 36 }}/>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={c.id} onClick={() => onOpen(c.id)}>
              <td>
                <span style={{
                  display: 'inline-grid', placeItems: 'center',
                  width: 26, height: 26, borderRadius: '50%',
                  background: 'var(--bg-sunk)', color: 'var(--ink-soft)',
                  fontSize: 11, fontWeight: 600,
                }}>{c.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</span>
              </td>
              <td className="col-num muted" style={{ fontSize: 12 }}>#{String(i + 1).padStart(2, '0')}</td>
              <td>
                <div style={{ fontWeight: 500, fontSize: 13.5 }}>{c.name}</div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>
                  {c.title} · {c.loc}
                </div>
                {c.parseWarning && (
                  <div style={{ fontSize: 11, color: 'var(--warn-ink)', marginTop: 3 }}>
                    <Icon name="alert" size={10}/> {c.parseWarning}
                  </div>
                )}
              </td>
              <td>
                <ScoreBar score={c.score} must={c.must} nice={c.nice} flag={c.flag}
                          variant={tweaks.scoreStyle}/>
                <div className="muted mono" style={{ fontSize: 10.5, marginTop: 4 }}>
                  {c.must} must · {c.nice} nice · {c.flag} flag
                </div>
              </td>
              <td><Confidence level={c.confidence}/></td>
              <td><StatusBadge s={c.status}/></td>
              <td><Icon name="chevron-right" size={14} className="muted"/></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ----- Candidate detail (slide-over panel) ----- */
function CandidateDetail({ candidateId, runId, onClose, onCandidateChange, tweaks }) {
  const c = CANDIDATES.find(x => x.id === candidateId) || CANDIDATES[0];
  const evalData = CANDIDATE_EVAL[candidateId] || CANDIDATE_EVAL.c1;
  const [activeCrit, setActiveCrit] = React.useState(null);
  const [decisions, setDecisions] = React.useState({});
  const decide = (id, v) => setDecisions(d => ({ ...d, [id]: d[id] === v ? null : v }));

  React.useEffect(() => {
    setActiveCrit(null);
    setDecisions({});
  }, [candidateId]);

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
            }}>{c.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 500, letterSpacing: '-0.005em' }}>
                {c.name}
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>
                {c.title} · {c.loc} · <span className="mono">{runId}</span>
              </div>
            </div>
            <ScoreBar score={c.score} must={c.must} nice={c.nice} flag={c.flag} variant={tweaks.scoreStyle}/>
            <StatusBadge s={c.status}/>
            <Confidence level={c.confidence}/>
            <IconBtn name="x" size={16} onClick={onClose}/>
          </div>
          {typeof onCandidateChange === 'function' && (
            <div style={{
              padding: '10px 22px',
              borderBottom: '1px solid var(--line)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              background: 'var(--surface)',
            }}>
              <label className="sr-only" htmlFor="caliper-drawer-candidate">Candidate</label>
              <select
                id="caliper-drawer-candidate"
                className="sel"
                style={{ width: 'min(360px, 100%)', height: 32, fontSize: 12.5 }}
                value={candidateId}
                onChange={(e) => onCandidateChange(e.target.value)}
              >
                {CANDIDATES.map((x) => (
                  <option key={x.id} value={x.id}>#{x.id.slice(1)}  {x.name} — {x.score}</option>
                ))}
              </select>
              <span className="muted" style={{ fontSize: 11.5 }}>Switch candidate without closing the panel.</span>
            </div>
          )}
        </div>
        <div key={candidateId} style={{ minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <DetailBody c={c} evalData={evalData} activeCrit={activeCrit} setActiveCrit={setActiveCrit}
                      decisions={decisions} decide={decide} layout={tweaks.detailLayout}/>
        </div>
      </div>
    </div>
  );
}

function DetailBody({ c, evalData, activeCrit, setActiveCrit, decisions, decide, layout }) {
  const all = evalData.sections.flatMap(s => s.items);
  return (
    <div className="detail__body" style={layout === 'stacked' ? { gridTemplateColumns: '1fr' } : null}>
      {layout !== 'stacked' && (
        <div className="detail__cv">
          <CVPage data={evalData.cv} activeCrit={activeCrit} criteria={all}/>
        </div>
      )}
      <div className="detail__eval">
        {evalData.sections.map((sec, si) => (
          <div key={si}>
            <div className="eval-sec">
              <span>{sec.label}</span>
              <span className="eval-sec__line"/>
              <span className="mono">
                {sec.items.filter(i => i.met).length}/{sec.items.length}
              </span>
            </div>
            {sec.items.map((it) => (
              <div key={it.id}
                   className={`crit${activeCrit === it.id ? ' is-active' : ''}`}
                   onMouseEnter={() => setActiveCrit(it.id)}
                   onMouseLeave={() => setActiveCrit(null)}>
                <div className="crit__hd">
                  <span style={{
                    width: 18, height: 18, borderRadius: '50%',
                    display: 'grid', placeItems: 'center', flex: 'none',
                    background: it.met ? (sec.kind === 'flag' ? 'var(--bad-soft)' : 'var(--ok-soft)') : 'var(--bg-sunk)',
                    color: it.met ? (sec.kind === 'flag' ? 'var(--bad-ink)' : 'var(--ok-ink)') : 'var(--muted)',
                  }}>
                    {it.met
                      ? (sec.kind === 'flag' ? <Icon name="alert" size={10} stroke={2.4}/> : <Icon name="check" size={11} stroke={2.6}/>)
                      : <Icon name="x" size={10} stroke={2.2}/>}
                  </span>
                  <span className="crit__name">{it.name}</span>
                  <Confidence level={it.conf}/>
                </div>

                {it.met && it.quote && (
                  <div className="crit__quote">“{it.quote}”</div>
                )}
                {it.met && it.inferred && (
                  <div className="crit__inferred">
                    <Icon name="info" size={11}/> Inferred — no direct quote. {it.inferred}
                  </div>
                )}
                {!it.met && it.notes && (
                  <div className="muted" style={{ fontSize: 12, padding: '4px 0 8px' }}>{it.notes}</div>
                )}

                {it.met && it.notes && (
                  <div className="muted" style={{ fontSize: 11.5, paddingBottom: 8 }}>
                    Note · {it.notes}
                  </div>
                )}

                <div className="crit__actions">
                  <DecisionBtn label="Agree" icon="check"
                               active={decisions[it.id] === 'agree'}
                               tone="ok"
                               onClick={() => decide(it.id, 'agree')}/>
                  <DecisionBtn label="Override" icon="edit"
                               active={decisions[it.id] === 'override'}
                               tone="warn"
                               onClick={() => decide(it.id, 'override')}/>
                  <DecisionBtn label="Add note" icon="plus"
                               active={decisions[it.id] === 'note'}
                               tone="default"
                               onClick={() => decide(it.id, 'note')}/>
                  <div className="spacer"/>
                  <span className="mono muted" style={{ fontSize: 10.5, alignSelf: 'center' }}>
                    weight ×{HERO_PROFILE[
                      sec.kind === 'must' ? 'mustHave' : sec.kind === 'nice' ? 'niceToHave' : 'redFlags'
                    ].find(x => x.id === it.id)?.weight || ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ))}

        <div className="row" style={{ marginTop: 14, padding: '14px 0', borderTop: '1px solid var(--line)', justifyContent: 'space-between' }}>
          <div className="muted" style={{ fontSize: 11.5 }}>
            <Icon name="history" size={11}/>{' '}
            {`Overrides on this candidate will be logged in this job's audit trail.`}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Btn variant="ghost" size="sm" icon="download">Export PDF</Btn>
            <Btn variant="primary" size="sm">Save decisions</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

const DecisionBtn = ({ label, icon, active, tone, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex h-[26px] items-center justify-center gap-1.5 rounded-md border px-2.5 text-[11.5px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 focus-visible:ring-offset-1"
    style={{
      background: active
        ? (tone === 'ok' ? 'var(--ok-soft)' : tone === 'warn' ? 'var(--warn-soft)' : 'var(--bg-sunk)')
        : 'var(--surface)',
      borderColor: active
        ? (tone === 'ok' ? 'oklch(0.78 0.10 150)' : tone === 'warn' ? 'oklch(0.80 0.12 70)' : 'var(--faint)')
        : 'var(--line)',
      color: active
        ? (tone === 'ok' ? 'var(--ok-ink)' : tone === 'warn' ? 'var(--warn-ink)' : 'var(--ink)')
        : 'var(--ink-soft)',
    }}>
    <Icon name={icon} size={11} stroke={2}/>
    {label}
  </button>
);

/* ----- The mock CV page with quote highlighting ----- */
function CVPage({ data, activeCrit, criteria }) {
  // Build a lookup: crit id -> quote text
  const quotes = React.useMemo(() => {
    const map = {};
    criteria.forEach(c => { if (c.quote) map[c.id] = c.quote; });
    return map;
  }, [criteria]);

  // Render text with all quote spans highlighted; the matching crit (activeCrit) gets active style.
  const renderText = (text) => {
    if (!text) return text;
    // collect matches
    const matches = [];
    Object.entries(quotes).forEach(([id, q]) => {
      const idx = text.indexOf(q);
      if (idx >= 0) matches.push({ id, start: idx, end: idx + q.length });
    });
    matches.sort((a, b) => a.start - b.start);
    if (matches.length === 0) return text;

    const parts = [];
    let cursor = 0;
    matches.forEach((m, i) => {
      if (m.start > cursor) parts.push(text.slice(cursor, m.start));
      parts.push(
        <span key={i} className={`hl${activeCrit === m.id ? ' hl--active' : ''}`}>
          {text.slice(m.start, m.end)}
        </span>
      );
      cursor = m.end;
    });
    if (cursor < text.length) parts.push(text.slice(cursor));
    return parts;
  };

  return (
    <div className="cv-page">
      <h1>{data.name}</h1>
      <div className="contact">{data.contact}</div>

      <h2>Summary</h2>
      <p>{renderText(data.summary)}</p>

      <h2>Experience</h2>
      {data.roles.map((r, i) => (
        <div key={i}>
          <div className="role">
            <span>{r.title}</span>
            <span className="role-dates">{r.dates} · {r.loc}</span>
          </div>
          <ul>
            {r.bullets.map((b, j) => <li key={j}>{renderText(b)}</li>)}
          </ul>
        </div>
      ))}

      <h2>Skills &amp; languages</h2>
      <p>{renderText(data.skills)}</p>
    </div>
  );
}

export default ResultsPage;
