// @ts-nocheck
// Page — Runs hub (all screening history)
import React from 'react'
import { Btn, Icon, Segmented, RunStatusBadge } from '@/caliper/ui'
import { api } from '@/services/api'
import type { RunListItem } from '@/services/api'

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

function formatDuration(started: string | null, completed: string | null): string {
  if (!started || !completed) return '—';
  const ms = new Date(completed).getTime() - new Date(started).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function RunsPage({ go }) {
  const [filter, setFilter] = React.useState('all');
  const [runs, setRuns] = React.useState<RunListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    api.runs.list()
      .then(setRuns)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = runs.filter((r) => filter === 'all' || r.status === filter);

  const thisMonth = runs.filter((r) => {
    const d = new Date(r.created_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const avgCvs = runs.length ? Math.round(runs.reduce((s, r) => s + r.cv_count, 0) / runs.length) : 0;

  if (loading) return <div className="page"><div className="muted" style={{ padding: 32 }}>Loading runs…</div></div>;
  if (error) return <div className="page"><div style={{ color: 'var(--bad)', padding: 32 }}>{error}</div></div>;

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="page__eyebrow">Runs · {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</div>
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

      <div className="stats" style={{ marginBottom: 28 }}>
        <StatCell label="Runs this month"     value={thisMonth.length} />
        <StatCell label="Avg. CVs per run"    value={avgCvs || '—'} />
        <StatCell label="Total runs"          value={runs.length} />
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <Segmented value={filter} onChange={setFilter} options={[
          { value: 'all',         label: `All  ${runs.length}` },
          { value: 'completed',   label: 'Completed' },
          { value: 'in_progress', label: 'In progress' },
          { value: 'failed',      label: 'Failed' },
        ]}/>
        <div className="spacer"/>
        <Btn icon="filter" variant="ghost" size="sm">Filter</Btn>
        <Btn icon="download" variant="ghost" size="sm">Export</Btn>
      </div>

      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 140 }}>Run ID</th>
              <th>Job</th>
              <th style={{ width: 110 }}>Date</th>
              <th style={{ width: 70 }} className="col-right">CVs</th>
              <th style={{ width: 130 }}>Score range</th>
              <th style={{ width: 110 }}>Duration</th>
              <th style={{ width: 140 }}>Status</th>
              <th style={{ width: 30 }}/>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 32 }}>No runs yet.</td></tr>
            )}
            {filtered.map(r => (
              <tr
                key={r.id}
                className={r.status === 'completed' ? 'is-clickable' : ''}
                onClick={() => r.status === 'completed' && go('results', r.id)}
                onKeyDown={(e) => {
                  if (r.status !== 'completed') return;
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go('results', r.id); }
                }}
                tabIndex={r.status === 'completed' ? 0 : undefined}
                role={r.status === 'completed' ? 'button' : undefined}
              >
                <td className="col-num muted" style={{ fontSize: 11.5 }}>{r.id}</td>
                <td>
                  <div style={{ fontWeight: 500 }}>{r.job_profiles?.name ?? r.job_id}</div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>{r.job_profiles?.dept}</div>
                </td>
                <td className="mono" style={{ fontSize: 11.5 }}>{formatDate(r.created_at)}</td>
                <td className="col-num col-right">{r.cv_count}</td>
                <td>
                  {r.score_range ? (
                    <div className="row" style={{ gap: 8 }}>
                      <span className="mono tnum" style={{ fontSize: 12 }}>{r.score_range[0]}</span>
                      <span style={{
                        flex: 1, height: 4, borderRadius: 2,
                        background: `linear-gradient(90deg, var(--bad) 0%, var(--warn) ${r.score_range[0]}%, var(--ok) ${r.score_range[1]}%, var(--line-soft) ${r.score_range[1]}%)`,
                        minWidth: 60, maxWidth: 90,
                      }}/>
                      <span className="mono tnum" style={{ fontSize: 12 }}>{r.score_range[1]}</span>
                    </div>
                  ) : <span className="muted">—</span>}
                </td>
                <td className="mono" style={{ fontSize: 11.5 }}>
                  {r.status === 'in_progress'
                    ? <span className="muted">In progress…</span>
                    : formatDuration(r.started_at, r.completed_at)}
                </td>
                <td>
                  <RunStatusBadge s={r.status}/>
                  {r.error_message && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{r.error_message}</div>}
                </td>
                <td><Icon name="chevron-right" size={14} className="muted"/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
        <div className="muted" style={{ fontSize: 11.5 }}>
          Showing {filtered.length} of {runs.length} runs
        </div>
      </div>
    </div>
  );
}

export default RunsPage;
