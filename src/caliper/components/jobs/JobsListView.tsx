// @ts-nocheck
import React from 'react'
import {
  Badge,
  Btn,
  Icon,
  PageEmpty,
  PageHeader,
  PageToolbar,
  PageToolbarSearch,
  DataTable,
  RunScreeningBtn,
  Segmented,
} from '@/caliper/ui'
import { prefetchRecruiteeApplicants } from '@/lib/applicants-cache'
import { JobsKpiStrip } from './JobsKpiStrip'
import { JobsSortableTh } from './JobsSortableTh'
import { CriteriaKindCountBadge } from './CriteriaKindCountBadge'
import {
  JOB_TABLE_SORT_KEYS,
  computeJobListKpis,
  openJobProfile,
} from './jobs-utils'

function JobRowCells({ p }) {
  const mc = (p.mustHave || []).length
  const nc = (p.niceToHave || []).length
  const fc = (p.redFlags || []).length
  const total = mc + nc + fc

  return (
    <>
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
        {p.source === 'recruitee' && p.applicantsCount != null ? p.applicantsCount : '—'}
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
    </>
  )
}

function JobListCard({ p, onOpen }) {
  const mc = (p.mustHave || []).length
  const nc = (p.niceToHave || []).length
  const fc = (p.redFlags || []).length
  const total = mc + nc + fc

  return (
    <button type="button" className="jobs-list-card" onClick={onOpen}>
      <div className="jobs-list-card__head">
        <div className="jobs-list-card__title">{p.name}</div>
        <Badge tone={p.status === 'open' ? 'ok' : 'ghost'} dot={p.status === 'open'}>
          {p.status === 'open' ? 'Open' : p.status === 'closed' ? 'Closed' : 'Archived'}
        </Badge>
      </div>
      <div className="jobs-list-card__meta muted">
        {[p.dept, p.postedOn].filter(Boolean).join(' · ') || p.id}
      </div>
      <div className="jobs-list-card__stats">
        <span>{p.runsCount || 0} runs</span>
        {p.source === 'recruitee' && p.applicantsCount != null && (
          <span>{p.applicantsCount} applicants</span>
        )}
        {total > 0 && <span>{total} criteria</span>}
      </div>
    </button>
  )
}

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
  hasUnassignedDepts = false,
  canEdit,
  backgroundRefreshing,
  onRefresh,
  onNewJob,
  onRunPicker,
  navigate,
}) {
  const kpis = computeJobListKpis(filtered)

  const openProfile = (p) => {
    if (p.source === 'recruitee' && p.sourceRef) {
      prefetchRecruiteeApplicants(p.sourceRef)
    }
    openJobProfile(navigate, p)
  }

  return (
    <div className="page jobs-page">
      {backgroundRefreshing && (
        <div className="jobs-refresh-banner" role="status">
          <Icon name="history" size={14} aria-hidden />
          Updating job list…
        </div>
      )}

      <PageHeader
        eyebrow="Recruiting"
        hideTitle
        subtitle={canEdit
          ? 'Open roles from Recruitee or manual entries. Set criteria, screen CVs, and review applicants per job.'
          : 'Browse open roles, review screening results, and track applicants per job.'}
      />

      <JobsKpiStrip kpis={kpis} />

      <PageToolbar className="jobs-toolbar">
        <PageToolbarSearch
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Search by title, department, or ID…"
          ariaLabel="Search jobs"
        />
        <Segmented
          value={filter}
          onChange={onFilterChange}
          options={[
            { value: 'all', label: `All ${filtered.length}` },
            { value: 'open', label: 'Open' },
            { value: 'closed', label: 'Closed' },
            { value: 'recruitee', label: 'Recruitee' },
            { value: 'manual', label: 'Manual' },
          ]}
        />
        {(departmentOptions.length > 0 || hasUnassignedDepts) && (
          <select
            className="sel jobs-toolbar__dept-filter"
            value={departmentFilter}
            onChange={(e) => onDepartmentFilterChange(e.target.value)}
            aria-label="Filter by department"
          >
            <option value="all">All departments</option>
            {hasUnassignedDepts && <option value="__unassigned__">Unassigned</option>}
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
      </PageToolbar>

      <div className="jobs-panel jobs-panel--flush" aria-busy={backgroundRefreshing}>
        <div className="jobs-table-wrap jobs-table-wrap--desktop">
          <DataTable variant="jobs">
            <thead>
              <tr>
                <JobsSortableTh label="Job" sortKey={JOB_TABLE_SORT_KEYS.name} sortState={jobTableSort} onSort={onSort} />
                <JobsSortableTh label="Posted" sortKey={JOB_TABLE_SORT_KEYS.posted} sortState={jobTableSort} onSort={onSort} style={{ width: 112 }} />
                <JobsSortableTh label="Source" sortKey={JOB_TABLE_SORT_KEYS.source} sortState={jobTableSort} onSort={onSort} style={{ width: 120 }} />
                <JobsSortableTh label="Department" sortKey={JOB_TABLE_SORT_KEYS.dept} sortState={jobTableSort} onSort={onSort} style={{ width: 140 }} />
                <JobsSortableTh label="Applicants" sortKey={JOB_TABLE_SORT_KEYS.applicants} sortState={jobTableSort} onSort={onSort} style={{ width: 88 }} className="col-right" />
                <JobsSortableTh label="Criteria" sortKey={JOB_TABLE_SORT_KEYS.criteria} sortState={jobTableSort} onSort={onSort} style={{ width: 160 }} />
                <JobsSortableTh label="Runs" sortKey={JOB_TABLE_SORT_KEYS.runs} sortState={jobTableSort} onSort={onSort} style={{ width: 72 }} className="col-right" />
                <JobsSortableTh label="Last run" sortKey={JOB_TABLE_SORT_KEYS.lastRun} sortState={jobTableSort} onSort={onSort} style={{ width: 120 }} />
                <JobsSortableTh label="Status" sortKey={JOB_TABLE_SORT_KEYS.status} sortState={jobTableSort} onSort={onSort} style={{ width: 100 }} />
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
                          ? (canEdit
                            ? 'Create a job manually or sync open roles from Recruitee to start screening CVs.'
                            : 'Jobs appear here once an editor or admin adds roles from Recruitee or creates them manually.')
                          : 'Try a different search or filter to find jobs.'}
                        actionLabel={jobs.length === 0 && canEdit ? 'New job' : undefined}
                        onAction={jobs.length === 0 && canEdit ? onNewJob : undefined}
                      />
                    </div>
                  </td>
                </tr>
              )}
              {visibleJobs.map((p) => (
                <tr
                  key={p.id}
                  onMouseDown={() => {
                    if (p.source === 'recruitee' && p.sourceRef) {
                      prefetchRecruiteeApplicants(p.sourceRef)
                    }
                  }}
                  onClick={() => openProfile(p)}
                >
                  <JobRowCells p={p} />
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>

        <div className="jobs-list-cards jobs-list-cards--mobile">
          {visibleJobs.length === 0 ? (
            <PageEmpty
              icon="briefcase"
              title={jobs.length === 0 ? 'No jobs yet' : 'No jobs match your filters'}
              description="Try a different search or filter."
              actionLabel={jobs.length === 0 && canEdit ? 'New job' : undefined}
              onAction={jobs.length === 0 && canEdit ? onNewJob : undefined}
            />
          ) : (
            visibleJobs.map((p) => (
              <JobListCard key={p.id} p={p} onOpen={() => openProfile(p)} />
            ))
          )}
        </div>
      </div>

      <p className="jobs-footer-meta">
        {filtered.length} of {jobs.length} jobs
      </p>
    </div>
  )
}
