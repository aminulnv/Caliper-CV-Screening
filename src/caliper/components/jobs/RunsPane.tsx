// @ts-nocheck
import React from 'react'
import { matchesTextQuery } from '@/lib/text-search'
import { JobsPanel } from '@/caliper/components/jobs/JobsPanel'
import { Icon, PageEmpty, RunStatusBadge } from '@/caliper/ui'

function RunsPane({ runs, go, onOpenRunSheet, canEdit = true }) {
  const [runQuery, setRunQuery] = React.useState('');

  const filteredRuns = React.useMemo(() => {
    const q = runQuery.trim();
    if (!q) return runs;
    return runs.filter((r) =>
      matchesTextQuery(q, [
        r.id,
        r.date,
        r.owner,
        r.status,
        r.cvs != null ? String(r.cvs) : null,
        r.scoreRange ? `${r.scoreRange[0]}-${r.scoreRange[1]}` : null,
      ]),
    );
  }, [runs, runQuery]);

  if (runs.length === 0) {
    return (
      <JobsPanel icon="history" title="Screening runs" sub="Each run scores CVs against this job's criteria.">
        <PageEmpty
          icon="list"
          title="No screening runs yet"
          description={canEdit
            ? 'Start one to score CVs for this job.'
            : 'You can view completed runs here once an editor or admin starts screening for this job.'}
          actionLabel="Run screening"
          onAction={canEdit ? () => onOpenRunSheet && onOpenRunSheet() : undefined}
          actionDisabled={!canEdit}
        />
      </JobsPanel>
    );
  }
  return (
    <JobsPanel
      icon="history"
      title="Screening runs"
      sub={`${runs.length} run${runs.length === 1 ? '' : 's'} for this job`}
      flush
    >
      <div className="col" style={{ gap: 12 }}>
        <div className="jobs-toolbar__search" style={{ maxWidth: 320 }}>
          <Icon name="search" size={16} className="jobs-toolbar__search-icon" aria-hidden />
          <input
            className="inp"
            placeholder="Search runs by ID, owner, status…"
            value={runQuery}
            onChange={(e) => setRunQuery(e.target.value)}
            aria-label="Search runs"
          />
        </div>
        {runQuery.trim() && filteredRuns.length === 0 && (
          <p className="muted" style={{ fontSize: 13 }}>No runs match “{runQuery.trim()}”.</p>
        )}
        <div className="jobs-table-wrap">
          <table className="jobs-table">
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
          {filteredRuns.map(r => (
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
      </div>
    </JobsPanel>
  );
}

export { RunsPane }
