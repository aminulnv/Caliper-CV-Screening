// @ts-nocheck
// Page — Runs hub (all screening history)
import React from 'react'
import { Btn, Icon, Segmented, RunStatusBadge, PageLoading, PageError, PageEmpty, Badge } from '@/caliper/ui'
import { api } from '@/services/api'
import type { RunListItem, WorkspaceMember } from '@/services/api'
import { RunAccessControl } from '@/caliper/components/RunAccessControl'
import { useAuth } from '@/contexts/AuthContext'
import {
  formatRunDate,
  formatRunDuration,
  runCreatedAt,
  runCvCount,
  runDateSortKey,
  runDurationSortKey,
  runScoreRange,
} from '@/lib/run-display'
import { matchesTextQuery } from '@/lib/text-search'

const RUN_TABLE_SORT_KEYS = {
  id: 'id',
  job: 'job',
  date: 'date',
  cvs: 'cvs',
  scoreRange: 'scoreRange',
  duration: 'duration',
  status: 'status',
};

function runSortValue(run, key) {
  switch (key) {
    case RUN_TABLE_SORT_KEYS.id:
      return run.id?.toLowerCase() ?? '';
    case RUN_TABLE_SORT_KEYS.job:
      return (run.job_profiles?.name ?? run.job_id ?? run.jobId ?? '').toLowerCase();
    case RUN_TABLE_SORT_KEYS.date:
      return runDateSortKey(run);
    case RUN_TABLE_SORT_KEYS.cvs:
      return runCvCount(run);
    case RUN_TABLE_SORT_KEYS.scoreRange: {
      const range = runScoreRange(run);
      return range ? range[1] : -1;
    }
    case RUN_TABLE_SORT_KEYS.duration:
      return runDurationSortKey(run);
    case RUN_TABLE_SORT_KEYS.status:
      return run.status ?? '';
    default:
      return '';
  }
}

function compareRunSortValues(a, b) {
  const aNum = typeof a === 'number';
  const bNum = typeof b === 'number';
  if (aNum && bNum) return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true });
}

function isRunDateSortKey(key) {
  return key === RUN_TABLE_SORT_KEYS.date || key === RUN_TABLE_SORT_KEYS.duration;
}

function compareRunDateSortValues(a, b, dir) {
  const aEmpty = a <= 0;
  const bEmpty = b <= 0;
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  return dir === 'asc' ? a - b : b - a;
}

function sortRuns(list, sortState) {
  if (!sortState) return list;
  return [...list].sort((a, b) => {
    const va = runSortValue(a, sortState.key);
    const vb = runSortValue(b, sortState.key);
    if (isRunDateSortKey(sortState.key)) {
      return compareRunDateSortValues(va, vb, sortState.dir);
    }
    const mult = sortState.dir === 'asc' ? 1 : -1;
    return mult * compareRunSortValues(va, vb);
  });
}

function cycleRunTableSort(prev, key) {
  if (prev?.key !== key) return { key, dir: 'desc' };
  if (prev.dir === 'desc') return { key, dir: 'asc' };
  return null;
}

function RunsSortableTh({ label, sortKey, sortState, onSort, style, className }) {
  const active = sortState?.key === sortKey;
  const dir = active ? sortState.dir : null;
  return (
    <th
      className={[
        'tbl-sort-th',
        active ? 'tbl-sort-th--active' : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
      style={style}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" className="tbl-sort-btn" onClick={() => onSort(sortKey)}>
        <span>{label}</span>
        {active && (
          <span className="tbl-sort-indicator" aria-hidden>
            {dir === 'desc' ? '↓' : '↑'}
          </span>
        )}
      </button>
    </th>
  );
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

function RunsPage({ go }) {
  const { displayName, avatarUrl, user } = useAuth();
  const [filter, setFilter] = React.useState('all');
  const [runs, setRuns] = React.useState<RunListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [shareMenuRunId, setShareMenuRunId] = React.useState<string | null>(null);
  const [members, setMembers] = React.useState<WorkspaceMember[] | null>(null);
  const [membersLoading, setMembersLoading] = React.useState(false);
  const [sortState, setSortState] = React.useState(null);
  const [runSearchQuery, setRunSearchQuery] = React.useState('');

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

  const sharedRuns = runs.filter((r) => !r.is_owner);
  const filtered = runs.filter((r) => {
    if (filter === 'shared') return !r.is_owner;
    if (filter === 'all') return true;
    return r.status === filter;
  });
  const searchFiltered = React.useMemo(() => {
    const q = runSearchQuery.trim();
    if (!q) return filtered;
    return filtered.filter((r) =>
      matchesTextQuery(q, [
        r.id,
        r.job_profiles?.name,
        r.job_id,
        r.owner_name,
        r.owner_id,
        r.run_note,
        r.status,
        r.model_used,
      ]),
    );
  }, [filtered, runSearchQuery]);
  const displayRuns = sortRuns(searchFiltered, sortState);

  const handleSort = (key) => {
    setSortState((prev) => cycleRunTableSort(prev, key));
  };

  const thisMonth = runs.filter((r) => {
    const d = runCreatedAt(r);
    if (!d) return false;
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const avgCvs = runs.length
    ? Math.round(runs.reduce((s, r) => s + runCvCount(r), 0) / runs.length)
    : 0;

  if (loading) {
    return (
      <div className="page">
        <div className="card">
          <PageLoading title="Loading runs" message="Fetching processed CV runs…" />
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="page">
        <div className="card">
          <PageError message={error} onRetry={() => window.location.reload()} />
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="stats" style={{ marginTop: 20, marginBottom: 28 }}>
        <StatCell label="Runs this month"     value={thisMonth.length} />
        <StatCell label="Avg. CVs per run"    value={avgCvs || '—'} />
        <StatCell label="Total runs"          value={runs.length} />
      </div>

      <div className="row jobs-toolbar" style={{ marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320, minWidth: 160 }}>
          <input
            className="inp"
            placeholder="Search runs by ID, job, owner…"
            style={{ paddingLeft: 32, width: '100%' }}
            value={runSearchQuery}
            onChange={(e) => setRunSearchQuery(e.target.value)}
            aria-label="Search runs"
          />
          <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--muted)' }}/>
        </div>
        <Segmented value={filter} onChange={setFilter} options={[
          { value: 'all',         label: `All  ${runs.length}` },
          { value: 'shared',      label: `Shared with me  ${sharedRuns.length}` },
          { value: 'completed',   label: 'Completed' },
          { value: 'in_progress', label: 'In progress' },
          { value: 'queued',      label: 'Queued' },
          { value: 'failed',      label: 'Failed' },
        ]}/>
        <div className="spacer"/>
        <Btn icon="briefcase" variant="primary" size="sm" onClick={() => go('profiles')}>Jobs</Btn>
      </div>

      <div className="card">
        <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <RunsSortableTh
                label="Run ID"
                sortKey={RUN_TABLE_SORT_KEYS.id}
                sortState={sortState}
                onSort={handleSort}
                style={{ width: 140 }}
              />
              <RunsSortableTh
                label="Job"
                sortKey={RUN_TABLE_SORT_KEYS.job}
                sortState={sortState}
                onSort={handleSort}
              />
              <th style={{ width: 200 }}>Access</th>
              <RunsSortableTh
                label="Date"
                sortKey={RUN_TABLE_SORT_KEYS.date}
                sortState={sortState}
                onSort={handleSort}
                style={{ width: 110 }}
              />
              <RunsSortableTh
                label="CVs"
                sortKey={RUN_TABLE_SORT_KEYS.cvs}
                sortState={sortState}
                onSort={handleSort}
                style={{ width: 70 }}
                className="col-right"
              />
              <RunsSortableTh
                label="Score range"
                sortKey={RUN_TABLE_SORT_KEYS.scoreRange}
                sortState={sortState}
                onSort={handleSort}
                style={{ width: 130 }}
              />
              <RunsSortableTh
                label="Duration"
                sortKey={RUN_TABLE_SORT_KEYS.duration}
                sortState={sortState}
                onSort={handleSort}
                style={{ width: 110 }}
              />
              <RunsSortableTh
                label="Status"
                sortKey={RUN_TABLE_SORT_KEYS.status}
                sortState={sortState}
                onSort={handleSort}
                style={{ width: 140 }}
              />
              <th style={{ width: 36 }}/>
            </tr>
          </thead>
          <tbody>
            {displayRuns.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <PageEmpty
                    icon="play"
                    title={runs.length === 0 ? 'No runs yet' : 'No runs match your search'}
                    description={
                      runs.length === 0
                        ? 'Start a screening run from a job to see processed CVs here.'
                        : 'Try a different search term or status filter.'
                    }
                    actionLabel={runs.length === 0 ? 'Go to jobs' : undefined}
                    onAction={runs.length === 0 ? () => go('profiles') : undefined}
                  />
                </td>
              </tr>
            )}
            {displayRuns.map((r) => {
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
                  <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 500 }}>{r.job_profiles?.name ?? r.job_id ?? r.jobId}</div>
                    {!r.is_owner && (
                      <Badge tone="info" dot>Shared with you</Badge>
                    )}
                  </div>
                  {r.job_profiles?.dept && (
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>
                      {r.job_profiles.dept}
                    </div>
                  )}
                  {!r.is_owner && r.owner_name && (
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                      By {r.owner_name}
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
      </div>

      <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
        <div className="muted" style={{ fontSize: 11.5 }}>
          Showing {displayRuns.length} of {runs.length} runs
        </div>
      </div>
    </div>
  );
}

export default RunsPage;
