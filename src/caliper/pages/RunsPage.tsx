// @ts-nocheck
// Page — Runs hub (all screening history)
import React from 'react'
import { Btn, Icon, Segmented, RunStatusBadge } from '@/caliper/ui'
import { api } from '@/services/api'
import type { RunListItem, WorkspaceMember } from '@/services/api'
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

const MemberAvatar = ({ member }) => {
  const initials = (member.name ?? member.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  if (member.avatar_url) {
    return (
      <img
        src={member.avatar_url}
        alt=""
        referrerPolicy="no-referrer"
        style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0 }}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
        display: 'inline-grid', placeItems: 'center',
        background: 'var(--bg-sunk)', color: 'var(--ink-soft)',
        fontSize: 9.5, fontWeight: 600, letterSpacing: '0.02em',
      }}
    >
      {initials}
    </span>
  );
};

/** Dropdown listing workspace members; toggling a person updates the share list. */
function ShareMenu({ sharedUserIds, members, loading, onToggle, onClose }) {
  const [query, setQuery] = React.useState('');
  const menuRef = React.useRef(null);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    inputRef.current?.focus();
    const onMouseDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const shared = new Set(sharedUserIds);
  const q = query.trim().toLowerCase();
  const people = (members ?? [])
    .filter((m) => !m.is_current_user)
    .filter((m) => !q
      || (m.name ?? '').toLowerCase().includes(q)
      || m.email.toLowerCase().includes(q));

  return (
    <div
      ref={menuRef}
      role="menu"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 30,
        width: 260, padding: 8,
        background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 10, boxShadow: 'var(--shadow-2, 0 8px 24px rgba(0,0,0,.12))',
        textAlign: 'left',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', padding: '2px 4px 8px' }}>
        Share with…
      </div>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type a name or email"
        style={{
          width: '100%', height: 28, padding: '0 8px', marginBottom: 6,
          fontSize: 12, color: 'var(--ink)',
          background: 'var(--bg-sunk)', border: '1px solid var(--line)', borderRadius: 7,
          outline: 'none',
        }}
      />
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        {loading && <div className="muted" style={{ fontSize: 12, padding: 8 }}>Loading people…</div>}
        {!loading && people.length === 0 && (
          <div className="muted" style={{ fontSize: 12, padding: 8 }}>
            {q ? 'No one matches that name.' : 'No one else to share with yet.'}
          </div>
        )}
        {!loading && people.map((m) => {
          const isShared = shared.has(m.user_id);
          return (
            <button
              key={m.user_id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={isShared}
              onClick={() => onToggle(m)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '6px 8px',
                background: 'transparent', border: 'none', borderRadius: 7,
                cursor: 'pointer', textAlign: 'left',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-sunk)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <MemberAvatar member={m}/>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.name ?? m.email}
                </span>
                {m.name && (
                  <span className="muted" style={{ display: 'block', fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.email}
                  </span>
                )}
              </span>
              {isShared && <Icon name="check" size={13} style={{ color: 'var(--ok-ink, var(--ok))', flexShrink: 0 }}/>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RunsPage({ go }) {
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
    setShareMenuRunId((current) => (current === runId ? null : runId));
    if (!members && !membersLoading) {
      setMembersLoading(true);
      api.workspace.listMembers()
        .then((res) => setMembers(res.members))
        .catch(() => setMembers([]))
        .finally(() => setMembersLoading(false));
    }
  };

  const toggleShare = (run, member) => {
    const current = run.shared_user_ids ?? [];
    const next = current.includes(member.user_id)
      ? current.filter((id) => id !== member.user_id)
      : [...current, member.user_id];

    // Optimistic update; roll back if the request fails.
    setRuns((prev) => prev.map((r) => (r.id === run.id ? { ...r, shared_user_ids: next } : r)));
    api.runs.setShares(run.id, next).catch(() => {
      setRuns((prev) => prev.map((r) => (r.id === run.id ? { ...r, shared_user_ids: current } : r)));
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
              <th style={{ width: 110 }}>Date</th>
              <th style={{ width: 70 }} className="col-right">CVs</th>
              <th style={{ width: 130 }}>Score range</th>
              <th style={{ width: 110 }}>Duration</th>
              <th style={{ width: 140 }}>Status</th>
              <th style={{ width: 64 }}/>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 32 }}>No runs yet.</td></tr>
            )}
            {filtered.map((r) => {
              const scoreRange = runScoreRange(r);
              return (
              <tr
                key={r.id}
                className={isRunOpenable(r) ? 'is-clickable' : ''}
                onClick={() => openRun(r)}
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
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>
                    {r.job_profiles?.dept}
                    {!r.is_owner && (
                      <span style={{ marginLeft: r.job_profiles?.dept ? 6 : 0 }}>
                        · Shared by {(r.owner_name ?? r.ownerName) || (r.owner_email ?? r.ownerEmail) || 'a teammate'}
                      </span>
                    )}
                  </div>
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
                  <div className="row" style={{ gap: 2, justifyContent: 'flex-end', position: 'relative' }}>
                    {r.is_owner && (
                      <button
                        type="button"
                        title={r.shared_user_ids?.length
                          ? `Shared with ${r.shared_user_ids.length} ${r.shared_user_ids.length === 1 ? 'person' : 'people'}`
                          : 'Share this run'}
                        aria-label="Share this run"
                        aria-expanded={shareMenuRunId === r.id}
                        onClick={() => openShareMenu(r.id)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          height: 24, padding: '0 7px',
                          background: r.shared_user_ids?.length ? 'var(--bg-sunk)' : 'transparent',
                          border: 'none', borderRadius: 6, cursor: 'pointer',
                          color: r.shared_user_ids?.length ? 'var(--ink-soft)' : 'var(--muted)',
                          fontSize: 11,
                        }}
                      >
                        <Icon name="share" size={12}/>
                        {r.shared_user_ids?.length > 0 && <span className="tnum">{r.shared_user_ids.length}</span>}
                      </button>
                    )}
                    {shareMenuRunId === r.id && (
                      <ShareMenu
                        sharedUserIds={r.shared_user_ids ?? []}
                        members={members}
                        loading={membersLoading}
                        onToggle={(member) => toggleShare(r, member)}
                        onClose={() => setShareMenuRunId(null)}
                      />
                    )}
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
