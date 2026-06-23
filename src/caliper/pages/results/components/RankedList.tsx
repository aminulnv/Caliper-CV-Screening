// @ts-nocheck
import React from 'react'
import { Icon, StatusBadge, Badge, ScoreTrustCard } from '@/caliper/ui'
import { DispositionBadge } from '@/caliper/components/DispositionBadge'
import { PipelineStageActions } from '@/caliper/components/PipelineStageActions'
import {
  candidateMetrics,
  recruiteeStateFor,
  candidateShowsDisqualified,
} from '../results-utils'
import { ResultsSortableTh } from './ResultsSortableTh'
import { RecruiteeStatusBadge } from './RecruiteeStatusBadge'

export function RankedList({
  rows,
  emptyMessage = 'No candidates yet.',
  onOpen,
  tweaks,
  compareSelection = [],
  maxCompare = 4,
  onToggleCompare,
  canEdit = false,
  onDisposition,
  onMoveToStage,
  useRecruiteePipeline = false,
  pipelineStages = [],
  canPushRecruitee = false,
  dispositionBusy = false,
  recruiteeStateById,
  sortState,
  rankByCandidateId,
  onSort,
  dispositionFlashIds = [],
}) {
  if (rows.length === 0) {
    return <div className="card"><div className="muted" style={{ textAlign: 'center', padding: 32 }}>{emptyMessage}</div></div>;
  }
  const atMax = compareSelection.length >= maxCompare;
  return (
    <div className="card">
      <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th className="compare-select-cell" style={{ width: 36 }} aria-label="Compare selection"/>
            <th style={{ width: 36 }}/>
            <ResultsSortableTh label="Rank" sortKey="rank" sortState={sortState} onSort={onSort} style={{ width: 56 }}/>
            <ResultsSortableTh label="Candidate" sortKey="candidate" sortState={sortState} onSort={onSort}/>
            <ResultsSortableTh label="% met" sortKey="pct_met" sortState={sortState} onSort={onSort} style={{ width: 88 }} className="col-num"/>
            <ResultsSortableTh label="Score" sortKey="score" sortState={sortState} onSort={onSort} style={{ width: 220 }}/>
            <ResultsSortableTh label="Status" sortKey="status" sortState={sortState} onSort={onSort} style={{ width: 160 }} className="tbl-col-hide-sm"/>
            <ResultsSortableTh
              label={useRecruiteePipeline ? 'Pipeline' : 'Decision'}
              sortKey="pipeline"
              sortState={sortState}
              onSort={onSort}
              style={{ width: 160 }}
              className="tbl-col-hide-sm"
            />
            <th style={{ width: 36 }}/>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => {
            const m = candidateMetrics(c);
            const isCompareSelected = compareSelection.includes(c.id);
            const compareDisabled = !isCompareSelected && atMax;
            const rState = recruiteeStateFor(c, recruiteeStateById);
            const isDisqualified = candidateShowsDisqualified(c, recruiteeStateById, useRecruiteePipeline);
            return (
            <tr
              key={c.id}
              tabIndex={0}
              role="button"
              onClick={() => onOpen(c.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpen(c.id);
                }
              }}
              className={`is-clickable focus-ring${isCompareSelected ? ' is-compare-selected' : ''}${dispositionFlashIds.includes(c.id) ? ' is-disposition-flash' : ''}`}
            >
              <td className="compare-select-cell" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={isCompareSelected}
                  disabled={compareDisabled}
                  aria-label={`Select ${c.name ?? 'candidate'} for comparison`}
                  title={compareDisabled ? `Maximum ${maxCompare} candidates` : undefined}
                  className="focus-ring"
                  onChange={() => onToggleCompare?.(c.id)}
                />
              </td>
              <td>
                <span style={{
                  display: 'inline-grid', placeItems: 'center',
                  width: 26, height: 26, borderRadius: '50%',
                  background: 'var(--bg-sunk)', color: 'var(--ink-soft)',
                  fontSize: 11, fontWeight: 600,
                }}>{(c.name ?? '??').split(' ').map((n) => n[0]).slice(0, 2).join('')}</span>
              </td>
              <td className="col-num muted" style={{ fontSize: 12 }}>#{String(rankByCandidateId?.get(c.id) ?? i + 1).padStart(2, '0')}</td>
              <td>
                <div style={{ fontWeight: 500, fontSize: 13.5 }}>{c.name ?? '—'}</div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>{c.title} · {c.location}</div>
                {c.parse_warning && (
                  <div style={{ fontSize: 11, color: 'var(--warn-ink)', marginTop: 3 }}>
                    <Icon name="alert" size={10}/> {c.parse_warning}
                  </div>
                )}
              </td>
              <td className="mono" style={{ fontSize: 12 }}>
                {m.criteriaMetPct != null ? `${m.criteriaMetPct}%` : '—'}
              </td>
              <td>
                <ScoreTrustCard
                  score={c.score ?? 0}
                  must={m.mustMet}
                  nice={m.niceMet}
                  flag={m.flagTriggered}
                  confidence={c.confidence}
                />
              </td>
              <td className="tbl-col-hide-sm"><StatusBadge s={c.status}/></td>
              <td className="tbl-col-hide-sm" onClick={(e) => e.stopPropagation()}>
                <div className="decision-cell">
                  {rState ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <RecruiteeStatusBadge state={rState} compact />
                      {c.disposition && c.recruitee_sync_status === 'failed' && (
                        <span className="disposition-badge-wrap__sync-failed" title="Last Caliper push to Recruitee failed">!</span>
                      )}
                    </span>
                  ) : isDisqualified ? (
                    <Badge tone="bad" dot>Disqualified</Badge>
                  ) : (
                    <DispositionBadge
                      disposition={c.disposition}
                      targetStageName={c.target_stage_name}
                      syncStatus={c.recruitee_sync_status}
                      compact
                      recruiteePipeline={useRecruiteePipeline}
                    />
                  )}
                  {!c.disposition && !rState && !isDisqualified && (
                    <span className="muted" style={{ fontSize: 11 }}>Undecided</span>
                  )}
                  {canEdit && (
                    useRecruiteePipeline && pipelineStages.length > 0 ? (
                      <PipelineStageActions
                        compact
                        stages={pipelineStages}
                        disabled={dispositionBusy}
                        onStage={(stage) => onMoveToStage?.([c.id], stage)}
                        onDisqualify={isDisqualified ? undefined : () => onDisposition?.([c.id], 'reject')}
                        showHold={false}
                        showDisqualify={!isDisqualified}
                        moveLabel={isDisqualified ? 'Re-qualify to…' : 'Move to…'}
                      />
                    ) : (
                      <div className="decision-cell__actions">
                        <button type="button" disabled={dispositionBusy}
                                onClick={() => onDisposition?.([c.id], 'shortlist')}>Shortlist</button>
                        <button type="button" disabled={dispositionBusy}
                                onClick={() => onDisposition?.([c.id], 'hold')}>Hold</button>
                        <button type="button" disabled={dispositionBusy}
                                onClick={() => onDisposition?.([c.id], 'reject')}>Reject</button>
                      </div>
                    )
                  )}
                </div>
              </td>
              <td><Icon name="chevron-right" size={14} className="muted"/></td>
            </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
