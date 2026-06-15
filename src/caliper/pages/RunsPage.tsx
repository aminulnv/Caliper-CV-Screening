// @ts-nocheck
// Page — Runs hub (all screening history)
import React from 'react'
import { Btn, Icon, Segmented, RunStatusBadge } from '@/caliper/ui'
import { api } from '@/services/api'
import type { RunListItem, WorkspaceMember } from '@/services/api'
import { RunAccessControl } from '@/caliper/components/RunAccessControl'
import { useAuth } from '@/contexts/AuthContext'
import {
  formatRunDate,
  formatRunDuration,
  runCreatedAt,
  runCvCount,
  runScoreRange,
} from '@/lib/run-display'

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

function RunsPage({ go }) {
  const { displayName, avatarUrl, user } = useAuth();
  const [filter, setFilter] = React.useState('all');
  const [runs, setRuns] = React.useState<RunListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [shareMenuRunId, setShareMenuRunId] = React.useState<string | null>(null);
  const [members, setMembers] = React.useState<WorkspaceMember[] | null>(null);
  const [membersLoading, setMembersLoading] = React.useState(false);

  React.useEffect(() => {
    api.runs.list()
      .then(setRuns)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const hasActiveRuns = runs.some((r) => r.status === 'in_progress' || r.status === 'queued');
  React.useEffect(() => {
    if (!hasActiveRuns) return;
    const interval = setInterval(() => {
      api.runs.list()
        .then(setRuns)
        .catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [hasActiveRuns]);

  const openRun = (run) => {
    if (run.status === 'completed' || run.status === 'in_progress' || run.status === 'failed' || run.status === 'queued') {
      go('results', run.id);
    }
  };
  const isRunOpenable = (run) =>
    run.status === 'completed' || run.status === 'in_progress' || run.status === 'failed' || run.status === 'queued';

  const openShareMenu = (runId: string) => {
    setShareMenuRunId(runId);
    if (!members && !membersLoading) {
      setMembersLoading(true);
      api.workspace.listMembers()
        .then((res) => setMembers(res.members))
        .catch(() => setMembers([]))
        .finally(() => setMembersLoading(false));
    }
  };

  const toggleShare = (runId, member) => {
    let nextIds;
    let rollback;

    setRuns((prev) => {
      const run = prev.find((item) => item.id === runId);
      if (!run) return prev;

      const current = Array.isArray(run.shared_user_ids) ? run.shared_user_ids : [];
      const currentShared = Array.isArray(run.shared_users) ? run.shared_users : [];
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

      return prev.map((item) => (
        item.id === runId ? { ...item, shared_user_ids: nextIds, shared_users: nextShared } : item
      ));
    });

    if (!nextIds) return;

    api.runs.setShares(runId, nextIds).catch(() => {
      if (!rollback) return;
      setRuns((prev) => prev.map((item) => (
        item.id === runId ? { ...item, ...rollback } : item
      )));
    });
  };

  const filtered = runs.filter((r) => filter === 'all' || r.status === filter);

  const thisMonth = runs.filter((r) => {
    const d = runCreatedAt(r);
    if (!d) return false;
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const avgCvs = runs.length
    ? Math.round(runs.reduce((s, r) => s + runCvCount(r), 0) / runs.length)
    : 0;

  if (loading) return <div className="page"><div className="muted" style={{ padding: 32 }}>Loading runs…</div></div>;
  if (error) return <div className="page"><div style={{ color: 'var(--bad)', padding: 32 }}>{error}</div></div>;

  return (
    <div className="page">
      <div className="stats" style={{ marginTop: 20, marginBottom: 28 }}>
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
        <Btn icon="search" variant="ghost" size="sm">Search</Btn>
        <Btn icon="briefcase" variant="primary" size="sm" onClick={() => go('profiles')}>Jobs</Btn>
        <Btn icon="filter" variant="ghost" size="sm">Filter</Btn>
        <Btn icon="download" variant="ghost" size="sm">Export</Btn>
      </div>

      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 140 }}>Run ID</th>
              <th>Job</th>
              <th style={{ width: 200 }}>Access</th>
              <th style={{ width: 110 }}>Date</th>
              <th style={{ width: 70 }} className="col-right">CVs</th>
              <th style={{ width: 130 }}>Score range</th>
              <th style={{ width: 110 }}>Duration</th>
              <th style={{ width: 140 }}>Status</th>
              <th style={{ width: 36 }}/>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="muted" style={{ textAlign: 'center', padding: 32 }}>No runs yet.</td></tr>
            )}
            {filtered.map((r) => {
              const scoreRange = runScoreRange(r);
              return (
              <tr
                key={r.id}
                className={isRunOpenable(r) ? 'is-clickable' : ''}
                onClick={(e) => {
                  if (e.target.closest('.run-access-control')) return;
                  openRun(r);
                }}
                onKeyDown={(e) => {
                  if (!isRunOpenable(r)) return;
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRun(r); }
                }}
                tabIndex={isRunOpenable(r) ? 0 : undefined}
                role={isRunOpenable(r) ? 'button' : undefined}
              >
                <td className="col-num muted" style={{ fontSize: 11.5 }}>{r.id}</td>
                <td>
                  <div style={{ fontWeight: 500 }}>{r.job_profiles?.name ?? r.job_id}</div>
                  {r.job_profiles?.dept && (
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>
                      {r.job_profiles.dept}
                    </div>
                  )}
                </td>
                <td
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <RunAccessControl
                    run={r}
                    currentUserName={displayName}
                    currentUserEmail={user?.email}
                    currentUserAvatar={avatarUrl}
                    members={members}
                    membersLoading={membersLoading}
                    open={shareMenuRunId === r.id}
                    onOpen={() => openShareMenu(r.id)}
                    onClose={() => setShareMenuRunId(null)}
                    onToggleShare={(member) => toggleShare(r.id, member)}
                  />
                </td>
                <td className="mono" style={{ fontSize: 11.5 }}>{formatRunDate(r)}</td>
                <td className="col-num col-right">{runCvCount(r)}</td>
                <td>
                  {scoreRange ? (
                    <div className="row" style={{ gap: 8 }}>
                      <span className="mono tnum" style={{ fontSize: 12 }}>{scoreRange[0]}</span>
                      <span style={{
                        flex: 1, height: 4, borderRadius: 2,
                        background: `linear-gradient(90deg, var(--bad) 0%, var(--warn) ${scoreRange[0]}%, var(--ok) ${scoreRange[1]}%, var(--line-soft) ${scoreRange[1]}%)`,
                        minWidth: 60, maxWidth: 90,
                      }}/>
                      <span className="mono tnum" style={{ fontSize: 12 }}>{scoreRange[1]}</span>
                    </div>
                  ) : <span className="muted">—</span>}
                </td>
                <td className="mono" style={{ fontSize: 11.5 }}>
                  {r.status === 'in_progress'
                    ? <span className="muted">In progress…</span>
                    : formatRunDuration(r)}
                </td>
                <td>
                  <RunStatusBadge s={r.status}/>
                  {r.error_message && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{r.error_message}</div>}
                </td>
                <td onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <div className="row" style={{ gap: 2, justifyContent: 'flex-end' }}>
                    <Icon name="chevron-right" size={14} className="muted"/>
                  </div>
                </td>
              </tr>
            );
            })}
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
