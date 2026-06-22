// @ts-nocheck
import React from 'react'
import { Badge, Btn, Icon, PageEmpty, RunScreeningBtn, Segmented } from '@/caliper/ui'
import { prefetchRecruiteeApplicants } from '@/lib/applicants-cache'
import { JobsKpiStrip } from './JobsKpiStrip'
import { JobsSortableTh } from './JobsSortableTh'
import { CriteriaKindCountBadge } from './CriteriaKindCountBadge'
import {
  JOB_TABLE_SORT_KEYS,
  computeJobListKpis,
  openJobProfile,
} from './jobs-utils'

export function JobsListView({
  jobs,
  filtered,
  visibleJobs,
  jobTableSort,
  onSort,
  searchQuery,
  onSearchChange,
  filter,
  onFilterChange,
  departmentFilter,
  departmentOptions,
  onDepartmentFilterChange,
  canEdit,
  backgroundRefreshing,
  onRefresh,
  onNewJob,
  onRunPicker,
  setSelectedId,
  setEditorInitialTab,
  setRunSheetProfileId,
}) {
  const kpis = computeJobListKpis(jobs)

  return (
    <div className="page jobs-page">
      {backgroundRefreshing && (
        <div className="jobs-refresh-banner" role="status">
          <Icon name="history" size={14} aria-hidden />
          Updating job list…
        </div>
      )}

      <header className="jobs-page__header">
        <p className="page__eyebrow">Recruiting</p>
        <h1 className="page__title" style={{ marginBottom: 6 }}>Jobs</h1>
        <p className="page__sub">
          Open roles from Recruitee or manual entries. Set criteria, screen CVs, and review applicants per job.
        </p>
      </header>

      <JobsKpiStrip kpis={kpis} />

      <div className="jobs-toolbar">
        <div className="jobs-toolbar__search">
          <Icon name="search" size={16} className="jobs-toolbar__search-icon" aria-hidden />
          <input
            className="inp"
            placeholder="Search by title, department, or ID…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search jobs"
          />
        </div>
        <Segmented
          value={filter}
          onChange={onFilterChange}
          options={[
            { value: 'all', label: `All ${jobs.length}` },
            { value: 'open', label: 'Open' },
            { value: 'closed', label: 'Closed' },
            { value: 'recruitee', label: 'Recruitee' },
            { value: 'manual', label: 'Manual' },
          ]}
        />
        {departmentOptions.length > 0 && (
          <select
            className="sel jobs-toolbar__dept-filter"
            value={departmentFilter}
            onChange={(e) => onDepartmentFilterChange(e.target.value)}
            aria-label="Filter by department"
          >
            <option value="all">All departments</option>
            {departmentOptions.map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
        )}
        <div className="spacer" />
        <div className="jobs-toolbar__actions">
          {canEdit && (
            <Btn
              variant="ghost"
              icon="history"
              disabled={backgroundRefreshing}
              onClick={() => onRefresh({ forceSync: true })}
            >
              {backgroundRefreshing ? 'Syncing…' : 'Sync Recruitee'}
            </Btn>
          )}
          <RunScreeningBtn canEdit={canEdit} variant="default" compact onClick={onRunPicker} />
          {canEdit && (
            <Btn variant="primary" icon="plus" onClick={onNewJob}>New job</Btn>
          )}
        </div>
      </div>

      <div className="jobs-panel jobs-panel--flush">
        <div className="jobs-table-wrap">
          <table className="jobs-table">
            <thead>
              <tr>
                <JobsSortableTh
                  label="Job"
                  sortKey={JOB_TABLE_SORT_KEYS.name}
                  sortState={jobTableSort}
                  onSort={onSort}
                />
                <JobsSortableTh
                  label="Posted"
                  sortKey={JOB_TABLE_SORT_KEYS.posted}
                  sortState={jobTableSort}
                  onSort={onSort}
                  style={{ width: 112 }}
                />
                <JobsSortableTh
                  label="Source"
                  sortKey={JOB_TABLE_SORT_KEYS.source}
                  sortState={jobTableSort}
                  onSort={onSort}
                  style={{ width: 120 }}
                />
                <JobsSortableTh
                  label="Department"
                  sortKey={JOB_TABLE_SORT_KEYS.dept}
                  sortState={jobTableSort}
                  onSort={onSort}
                  style={{ width: 140 }}
                />
                <JobsSortableTh
                  label="Applicants"
                  sortKey={JOB_TABLE_SORT_KEYS.applicants}
                  sortState={jobTableSort}
                  onSort={onSort}
                  style={{ width: 88 }}
                  className="col-right"
                />
                <JobsSortableTh
                  label="Criteria"
                  sortKey={JOB_TABLE_SORT_KEYS.criteria}
                  sortState={jobTableSort}
                  onSort={onSort}
                  style={{ width: 160 }}
                />
                <JobsSortableTh
                  label="Runs"
                  sortKey={JOB_TABLE_SORT_KEYS.runs}
                  sortState={jobTableSort}
                  onSort={onSort}
                  style={{ width: 72 }}
                  className="col-right"
                />
                <JobsSortableTh
                  label="Last run"
                  sortKey={JOB_TABLE_SORT_KEYS.lastRun}
                  sortState={jobTableSort}
                  onSort={onSort}
                  style={{ width: 120 }}
                />
                <JobsSortableTh
                  label="Status"
                  sortKey={JOB_TABLE_SORT_KEYS.status}
                  sortState={jobTableSort}
                  onSort={onSort}
                  style={{ width: 100 }}
                />
                <th style={{ width: 36 }}><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {visibleJobs.length === 0 && (
                <tr>
                  <td colSpan={10}>
                    <div className="jobs-table__empty">
                      <PageEmpty
                        icon="briefcase"
                        title={jobs.length === 0 ? 'No jobs yet' : 'No jobs match your filters'}
                        description={jobs.length === 0
                          ? 'Create a job manually or sync open roles from Recruitee to start screening CVs.'
                          : 'Try a different search or filter to find jobs.'}
                        actionLabel={jobs.length === 0 && canEdit ? 'New job' : undefined}
                        onAction={jobs.length === 0 && canEdit ? onNewJob : undefined}
                      />
                    </div>
                  </td>
                </tr>
              )}
              {visibleJobs.map((p) => {
                const mc = (p.mustHave || []).length
                const nc = (p.niceToHave || []).length
                const fc = (p.redFlags || []).length
                const total = mc + nc + fc
                return (
                  <tr
                    key={p.id}
                    onMouseDown={() => {
                      if (p.source === 'recruitee' && p.sourceRef) {
                        prefetchRecruiteeApplicants(p.sourceRef)
                      }
                    }}
                    onClick={() => openJobProfile(setSelectedId, setEditorInitialTab, setRunSheetProfileId, p)}
                  >
                    <td>
                      <div className="jobs-table__title" title={p.id}>{p.name}</div>
                      <div className="jobs-table__meta">
                        {[p.dept, p.postedOn].filter(Boolean).join(' · ') || p.id}
                      </div>
                    </td>
                    <td className="mono muted" style={{ fontSize: 13 }}>{p.postedOn ?? '—'}</td>
                    <td>
                      {p.source === 'recruitee'
                        ? <Badge tone="info"><Icon name="database" size={10} /> Recruitee</Badge>
                        : <Badge tone="ghost"><Icon name="edit" size={10} /> Manual</Badge>}
                    </td>
                    <td className="muted">
                      <span className="cell-truncate" title={p.dept}>{p.dept || '—'}</span>
                    </td>
                    <td className="col-num col-right mono" style={{ fontSize: 14 }}>
                      {p.source === 'recruitee' && p.applicantsCount != null
                        ? p.applicantsCount
                        : '—'}
                    </td>
                    <td>
                      {total > 0 ? (
                        <div className="jobs-table__criteria">
                          <CriteriaKindCountBadge count={mc} kind="must" />
                          <CriteriaKindCountBadge count={nc} kind="nice" />
                          <CriteriaKindCountBadge count={fc} kind="flag" />
                          <span className="jobs-table__criteria-total">{total} total</span>
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: 13 }}>
                          <Icon name="plus" size={12} /> Add criteria
                        </span>
                      )}
                    </td>
                    <td className="col-num col-right mono">{p.runsCount || 0}</td>
                    <td className="mono muted" style={{ fontSize: 13 }}>{p.lastRun || '—'}</td>
                    <td>
                      <Badge tone={p.status === 'open' ? 'ok' : p.status === 'closed' ? 'ghost' : 'default'} dot={p.status === 'open'}>
                        {p.status === 'open' ? 'Open' : p.status === 'closed' ? 'Closed' : 'Archived'}
                      </Badge>
                    </td>
                    <td><Icon name="chevron-right" size={14} className="muted" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="jobs-footer-meta">
        {filtered.length} of {jobs.length} jobs
      </p>
    </div>
  )
}
