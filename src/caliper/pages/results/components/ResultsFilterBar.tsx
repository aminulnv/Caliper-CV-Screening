// @ts-nocheck
import React from 'react'
import { Icon } from '@/caliper/ui'
import { countCandidatesByStage } from '@/lib/candidate-disposition-display'

export function ResultsFilterBar({
  candidateSearchQuery,
  onSearchChange,
  filterStatus,
  onFilterStatusChange,
  filterDisposition,
  onFilterDispositionChange,
  useRecruiteePipeline,
  pipelineStageGroups,
  candidates,
  nRejected,
  nOnHold,
  isRecruiteeJob,
  recruiteeQual,
  onRecruiteeQualChange,
  recruiteeQualifiedCount,
  recruiteeDisqualifiedCount,
}) {
  return (
    <div className="row results-page__filter-row">
      <span className="results-page__filter-label">Ranked list</span>
      <div className="results-page__search">
        <input
          className="inp results-page__search-input"
          placeholder="Search candidates…"
          value={candidateSearchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search candidates"
        />
        <Icon name="search" size={14} className="results-page__search-icon" />
      </div>
      <div className="spacer"/>
      <div className="row" style={{ gap: 8 }}>
        <span className="mono muted" style={{ fontSize: 11 }}>Status</span>
        <select className="sel results-page__filter-select"
                value={filterStatus} onChange={(e) => onFilterStatusChange(e.target.value)}>
          <option value="all">All</option>
          <option value="strong">Strong match</option>
          <option value="promising">Promising</option>
          <option value="review_flagged">Review / flagged</option>
          <option value="review">Review manually</option>
          <option value="flagged">Flagged</option>
        </select>
        <span className="mono muted" style={{ fontSize: 11, marginLeft: 8 }}>
          {useRecruiteePipeline ? 'Pipeline' : 'Decision'}
        </span>
        <select className="sel results-page__filter-select"
                value={filterDisposition} onChange={(e) => onFilterDispositionChange(e.target.value)}>
          <option value="all">All</option>
          <option value="undecided">Undecided</option>
          {useRecruiteePipeline ? (
            <>
              {pipelineStageGroups.map((group) => (
                <optgroup key={group.category} label={group.label}>
                  {group.stages.map((stage) => (
                    <option key={stage.id} value={`stage:${stage.id}`}>
                      {stage.name} ({countCandidatesByStage(candidates, stage.id)})
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value="reject">Disqualified ({nRejected})</option>
              <option value="hold">On hold · Caliper ({nOnHold})</option>
            </>
          ) : (
            <>
              <option value="shortlist">Shortlisted</option>
              <option value="hold">On hold</option>
              <option value="reject">Rejected</option>
              <option value="advanced">Advanced</option>
            </>
          )}
        </select>
        {isRecruiteeJob && (
          <>
            <span className="mono muted" style={{ fontSize: 11, marginLeft: 8 }}>Recruitee</span>
            <select className="sel results-page__filter-select"
                    value={recruiteeQual} onChange={(e) => onRecruiteeQualChange(e.target.value)}>
              <option value="all">All</option>
              <option value="qualified">Qualified ({recruiteeQualifiedCount})</option>
              <option value="disqualified">Disqualified ({recruiteeDisqualifiedCount})</option>
            </select>
          </>
        )}
      </div>
    </div>
  );
}
