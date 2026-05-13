// @ts-nocheck
// Page — Runs hub (all screening history)
import React from 'react'
import { RUNS, DEMO_RUN_SESSION_KEY } from '@/caliper/data'
import { Btn, Icon, Segmented, RunStatusBadge } from '@/caliper/ui'

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

function getLatestDemoRunFromSessionForRuns() {
  try {
    const key = DEMO_RUN_SESSION_KEY;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !d.run || !d.run.id) return null;
    if (d.completedAt && Date.now() - d.completedAt > 15 * 60 * 1000) return null;
    return d.run;
  } catch (_) {
    return null;
  }
}

function RunsPage({ go }) {
  const [filter, setFilter] = React.useState('all');
  const demoRun = getLatestDemoRunFromSessionForRuns();
  const mergedRuns = React.useMemo(() => {
    if (demoRun && !RUNS.some((r) => r.id === demoRun.id)) return [demoRun, ...RUNS];
    return RUNS;
  }, [demoRun]);
  const filtered = mergedRuns.filter((r) => filter === 'all' || r.status === filter);

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="page__eyebrow">Runs · May 2026</div>
          <h1 className="page__title">Screening runs</h1>
          <div className="page__sub">
            History of every CV screening. Open a completed run for rankings and overrides. To start screening, open a job under <strong>Jobs</strong> and use <strong>Run screening</strong>.
          </div>
        </div>
        <div className="row">
          <Btn icon="search" variant="ghost">Search</Btn>
          <Btn icon="layers" variant="primary" size="lg" onClick={() => go('profiles')}>Jobs</Btn>
        </div>
      </div>

      {/* Stats strip */}
      <div className="stats" style={{ marginBottom: 28 }}>
        <StatCell label="Runs this month"        value="14"     delta="+4" deltaTone="up"   sub="vs. April"/>
        <StatCell label="Avg. CVs per run"        value="41"     delta="+6" deltaTone="up"   sub="rolling 30d"/>
        <StatCell label="Avg. completion time"    value="3m 48s" delta="−42s" deltaTone="down" sub="faster than April"/>
      </div>

      {/* Filters bar */}
      <div className="row" style={{ marginBottom: 14 }}>
        <Segmented value={filter} onChange={setFilter} options={[
          { value: 'all',         label: `All  ${mergedRuns.length}` },
          { value: 'completed',   label: 'Completed' },
          { value: 'in_progress', label: 'In progress' },
          { value: 'failed',      label: 'Failed' },
        ]}/>
        <div className="spacer"/>
        <Btn icon="filter" variant="ghost" size="sm">Filter</Btn>
        <Btn icon="download" variant="ghost" size="sm">Export</Btn>
      </div>

      {/* Runs table */}
      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 140 }}>Run ID</th>
              <th>Job</th>
              <th style={{ width: 100 }}>Owner</th>
              <th style={{ width: 110 }}>Date</th>
              <th style={{ width: 70 }} className="col-right">CVs</th>
              <th style={{ width: 130 }}>Score range</th>
              <th style={{ width: 110 }}>Duration</th>
              <th style={{ width: 140 }}>Status</th>
              <th style={{ width: 30 }}/>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr
                key={r.id}
                className={r.status === 'completed' ? 'is-clickable' : ''}
                onClick={() => r.status === 'completed' && go('results', r.id)}
                onKeyDown={(e) => {
                  if (r.status !== 'completed') return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    go('results', r.id);
                  }
                }}
                tabIndex={r.status === 'completed' ? 0 : undefined}
                role={r.status === 'completed' ? 'button' : undefined}
                aria-label={r.status === 'completed' ? `Open results for ${r.id}` : undefined}
              >
                <td className="col-num muted" style={{ fontSize: 11.5 }}>
                  {r.id}
                  {r.isDemoSynthetic && (
                    <span className="mono muted" style={{ display: 'block', fontSize: 10, marginTop: 2 }}>recent demo</span>
                  )}
                </td>
                <td>
                  <div style={{ fontWeight: 500 }}>{r.job}</div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>
                    {r.dept} · {r.profile}
                  </div>
                </td>
                <td className="muted" style={{ fontSize: 12 }}>{r.owner}</td>
                <td className="mono" style={{ fontSize: 11.5 }}>{r.date}</td>
                <td className="col-num col-right">{r.cvs}</td>
                <td>
                  {r.scoreRange ? (
                    <div className="row" style={{ gap: 8 }}>
                      <span className="mono tnum" style={{ fontSize: 12 }}>{r.scoreRange[0]}</span>
                      <span style={{
                        flex: 1, height: 4, borderRadius: 2,
                        background: `linear-gradient(90deg, var(--bad) 0%, var(--warn) ${r.scoreRange[0]}%, var(--ok) ${r.scoreRange[1]}%, var(--line-soft) ${r.scoreRange[1]}%)`,
                        minWidth: 60, maxWidth: 90,
                      }}/>
                      <span className="mono tnum" style={{ fontSize: 12 }}>{r.scoreRange[1]}</span>
                    </div>
                  ) : <span className="muted">—</span>}
                </td>
                <td className="mono" style={{ fontSize: 11.5 }}>
                  {r.status === 'in_progress'
                    ? <span><div className="progress" style={{ width: 80, marginBottom: 4 }}><div className="progress__fill" style={{ width: `${r.progress}%` }}/></div>{r.progress}%</span>
                    : r.duration}
                </td>
                <td>
                  <RunStatusBadge s={r.status}/>
                  {r.error && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{r.error}</div>}
                </td>
                <td><Icon name="chevron-right" size={14} className="muted"/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
        <div className="muted" style={{ fontSize: 11.5 }}>
          Showing {filtered.length} of {mergedRuns.length} runs · all-time storage 1.2 GB
        </div>
        <div className="row" style={{ gap: 4 }}>
          <Btn variant="ghost" size="sm" icon="chevron-left">Prev</Btn>
          <Btn variant="ghost" size="sm" iconRight="chevron-right">Next</Btn>
        </div>
      </div>
    </div>
  );
}

export default RunsPage;
