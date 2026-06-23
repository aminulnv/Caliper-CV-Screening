// @ts-nocheck
import React from 'react'
import { CvViewer } from '@/caliper/components/CvViewer'
import {
  RecruiteePipelineBoard,
  RecruiteePipelineTabs,
  buildPipelineListGroups,
} from '@/caliper/components/RecruiteePipelineBoard'
import { RecruiteeEvalBadge } from '@/caliper/components/RecruiteeEvalBadge'
import type { EvalSortMode } from '@/lib/recruitee-eval-sort'
import { JobsPanel } from '@/caliper/components/jobs/JobsPanel'
import { matchesTextQuery } from '@/lib/text-search'
import {
  Icon,
  Btn,
  IconBtn,
  StatusBadge,
  Confidence,
  Segmented,
  PageEmpty,
} from '@/caliper/ui'

function RecruiteeCvModal({ candidateId, candidateName, onClose }) {
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="detail cv-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cv-preview-title"
      onClick={onClose}
    >
      <div
        className="cv-drawer__panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="detail__head">
          <div style={{ minWidth: 0 }}>
            <h2 id="cv-preview-title" className="cv-drawer__title">{candidateName}</h2>
            <p className="cv-drawer__sub muted">CV from Recruitee</p>
          </div>
          <IconBtn name="x" size={16} onClick={onClose} aria-label="Close" />
        </div>
        <div className="cv-drawer__body">
          <CvViewer
            candidateId={candidateId}
            candidateName={candidateName}
            cvSource="recruitee"
          />
        </div>
      </div>
    </div>
  );
}

function JobCandidatesPane({
  profile,
  rows,
  recruiteeData,
  recruiteeLoading,
  recruiteeError,
  scoredLoading = false,
  scoredError = null,
  completedRuns,
  dispositionByApplicantId,
  go,
  canEdit = true,
  onOpenRunSheet,
}) {
  const [cvPreview, setCvPreview] = React.useState(null);
  const [view, setView] = React.useState('board');
  const [pipelineView, setPipelineView] = React.useState('qualified');
  const [evalSort, setEvalSort] = React.useState<EvalSortMode>('default');
  const [applicantQuery, setApplicantQuery] = React.useState('');
  const [scoredQuery, setScoredQuery] = React.useState('');

  const recruiteeApps = recruiteeData?.applicants ?? [];
  const pipelineStages = recruiteeData?.pipeline?.stages ?? [];

  const searchedApps = React.useMemo(() => {
    const q = applicantQuery.trim();
    if (!q) return recruiteeApps;
    return recruiteeApps.filter((a) =>
      matchesTextQuery(q, [a.name, a.email, a.location, a.stage_name]),
    );
  }, [recruiteeApps, applicantQuery]);

  const qualifiedCount = searchedApps.filter((a) => !a.disqualified).length;
  const disqualifiedCount = searchedApps.filter((a) => a.disqualified).length;

  const otherTabMatchCount = React.useMemo(() => {
    const q = applicantQuery.trim();
    if (!q) return 0;
    const otherQualified = pipelineView !== 'qualified';
    return recruiteeApps.filter((a) => {
      const inOtherTab = otherQualified ? !a.disqualified : a.disqualified;
      if (!inOtherTab) return false;
      return matchesTextQuery(q, [a.name, a.email, a.location, a.stage_name]);
    }).length;
  }, [applicantQuery, pipelineView, recruiteeApps]);

  const listColSpan = pipelineView === 'disqualified' ? 5 : 4;

  const listGroups = React.useMemo(
    () => buildPipelineListGroups(pipelineStages, searchedApps, pipelineView, evalSort),
    [pipelineStages, searchedApps, pipelineView, evalSort],
  );

  const uniquePeople = React.useMemo(() => {
    const s = new Set();
    rows.forEach((r) => s.add(r.name.toLowerCase()));
    return s.size;
  }, [rows]);

  const hasRecruitee = profile.source === 'recruitee' && profile.sourceRef;
  const hasScreened = completedRuns.length > 0 && (rows.length > 0 || scoredLoading || scoredError);
  const showRecruitee = hasRecruitee && (recruiteeLoading || recruiteeApps.length > 0);

  if (!showRecruitee && !hasScreened) {
    return (
      <JobsPanel icon="users" title="Applicants" sub="Recruitee pipeline and screened candidates for this job.">
        {recruiteeLoading ? (
          <div className="jobs-skeleton" role="status">Loading applicants from Recruitee…</div>
        ) : recruiteeError ? (
          <>
            <PageEmpty icon="users" title="Could not load applicants" description={recruiteeError} />
            {(profile.applicantsCount ?? 0) > 0 && (
              <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
                {recruiteeError === 'Forbidden'
                  ? `Recruitee reports ${profile.applicantsCount} applicants for this role — you may not have permission to view them.`
                  : `Recruitee reports ${profile.applicantsCount} applicants for this role — fix the connection and refresh.`}
              </p>
            )}
          </>
        ) : (
          <PageEmpty
            icon="users"
            title="No applicants yet"
            description="Applicants from Recruitee appear here. After screening, scored candidates show in a separate section."
            actionLabel="Run screening"
            onAction={canEdit ? () => onOpenRunSheet && onOpenRunSheet() : undefined}
            actionDisabled={!canEdit}
          />
        )}
      </JobsPanel>
    );
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      {showRecruitee && (
        <>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, flex: '1 1 300px', minWidth: 0 }}>
              {profile.applicantsCount != null && recruiteeApps.length > 0 && recruiteeApps.length < profile.applicantsCount
                ? (
                  <>
                    Showing <strong>{recruiteeApps.length}</strong> of{' '}
                    <strong>{profile.applicantsCount}</strong> applicants in Recruitee
                    {recruiteeLoading ? ' · loading…' : ' (first batch loaded for screening)'}
                    .
                  </>
                )
                : (
                  <>
                    <strong>{recruiteeApps.length || profile.applicantsCount || 0}</strong> applicant
                    {(recruiteeApps.length || profile.applicantsCount || 0) === 1 ? '' : 's'} in Recruitee
                    {recruiteeLoading && ' · loading…'}
                    .
                  </>
                )}
              {' '}
              {canEdit
                ? <>Screen a whole stage from its column, or <strong>Run screening</strong> for everyone.</>
                : 'Grouped by Recruitee pipeline stage.'}
            </div>
            <Segmented value={view} onChange={setView} options={[
              { value: 'board', label: 'Board' },
              { value: 'list', label: 'List' },
            ]}/>
          </div>

          <RecruiteePipelineTabs
            pipelineView={pipelineView}
            onPipelineViewChange={setPipelineView}
            qualifiedCount={qualifiedCount}
            disqualifiedCount={disqualifiedCount}
          />

          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 300, minWidth: 160 }}>
              <input
                className="inp"
                placeholder="Search applicants by name…"
                style={{ paddingLeft: 32 }}
                value={applicantQuery}
                onChange={(e) => setApplicantQuery(e.target.value)}
                aria-label="Search applicants"
              />
              <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--muted)' }}/>
            </div>
            <div className="row" style={{ alignItems: 'center', gap: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>Sort within each stage</span>
              <Segmented
                value={evalSort}
                onChange={setEvalSort}
                options={[
                  { value: 'default', label: 'Default' },
                  { value: 'eval_desc', label: 'Eval ↓' },
                  { value: 'eval_asc', label: 'Eval ↑' },
                ]}
              />
            </div>
          </div>

          {applicantQuery.trim() && (
            <div className="muted" style={{ fontSize: 12 }}>
              {searchedApps.length === 0
                ? (
                  <>
                    No applicants match “{applicantQuery.trim()}” on{' '}
                    {pipelineView === 'qualified' ? 'Qualified' : 'Disqualified'}.
                    {otherTabMatchCount > 0 && (
                      <>
                        {' '}
                        <button
                          type="button"
                          className="linkish"
                          style={{ font: 'inherit' }}
                          onClick={() => setPipelineView(pipelineView === 'qualified' ? 'disqualified' : 'qualified')}
                        >
                          {otherTabMatchCount} match{otherTabMatchCount === 1 ? '' : 'es'} on{' '}
                          {pipelineView === 'qualified' ? 'Disqualified' : 'Qualified'} — switch tab
                        </button>
                      </>
                    )}
                  </>
                )
                : (
                  <>
                    <strong>{searchedApps.length}</strong> applicant{searchedApps.length === 1 ? '' : 's'} match “{applicantQuery.trim()}”.
                  </>
                )}
            </div>
          )}

          {recruiteeLoading && recruiteeApps.length === 0 ? (
            <div className="card">
              <div className="muted" style={{ padding: 20, fontSize: 12.5 }}>Loading applicants…</div>
            </div>
          ) : view === 'board' ? (
            <RecruiteePipelineBoard
              stages={pipelineStages}
              applicants={searchedApps}
              pipelineView={pipelineView}
              sortMode={evalSort}
              hideEmptyColumns={Boolean(applicantQuery.trim())}
              canEdit={canEdit}
              dispositionByApplicantId={dispositionByApplicantId}
              onView={(a) => setCvPreview({ id: a.id, name: a.name || 'Applicant' })}
              onScreenStage={(stage) => onOpenRunSheet && onOpenRunSheet(stage)}
            />
          ) : (
            <div className="card">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Applicant</th>
                    <th style={{ width: 160 }}>Location</th>
                    <th style={{ width: 88 }}>Evaluation</th>
                    {pipelineView === 'disqualified' && <th style={{ width: 200 }}>Reason</th>}
                    <th style={{ width: 100 }}>CV</th>
                  </tr>
                </thead>
                <tbody>
                  {listGroups.map(({ stage, items }) => (
                    <React.Fragment key={stage.id}>
                      <tr className="tbl-group">
                        <td colSpan={listColSpan}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span className="tbl-group__label">
                              <span
                                className="tbl-group__dot"
                                data-category={(stage.category || 'other').toLowerCase()}
                              />
                              {stage.name}
                            </span>
                            <span className="tbl-group__count">
                              {items.length} {items.length === 1 ? 'candidate' : 'candidates'}
                            </span>
                            {onOpenRunSheet && pipelineView === 'qualified' && items.length > 0 && (
                              canEdit ? (
                                <Btn
                                  size="sm"
                                  variant="ghost"
                                  icon="play"
                                  style={{ marginLeft: 'auto' }}
                                  onClick={() => onOpenRunSheet(stage.name)}
                                >
                                  Screen stage
                                </Btn>
                              ) : (
                                <span className="run-screening-locked run-screening-locked--inline">
                                  <Btn
                                    size="sm"
                                    variant="ghost"
                                    icon="lock"
                                    disabled
                                    aria-disabled="true"
                                    style={{ marginLeft: 'auto' }}
                                    aria-label="Screen stage (view-only)"
                                  >
                                    Screen stage
                                  </Btn>
                                  <p className="run-screening-locked__hint" role="note">
                                    View-only access. Editors and admins can run screenings.
                                  </p>
                                </span>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                      {items.length === 0 ? (
                        <tr>
                          <td colSpan={listColSpan} className="muted" style={{ fontSize: 12.5, padding: '10px 14px' }}>
                            No applicants
                          </td>
                        </tr>
                      ) : (
                        items.map((a) => (
                          <tr key={a.id}>
                            <td>
                              <div style={{ fontWeight: 500, fontSize: 13.5 }}>{a.name || 'Unknown'}</div>
                            </td>
                            <td className="muted">{a.location || '—'}</td>
                            <td>
                              <RecruiteeEvalBadge score={a.evaluation_score} inline />
                            </td>
                            {pipelineView === 'disqualified' && (
                              <td>
                                {a.disqualify_reason ? (
                                  <span className="cand-card__disqualify cand-card__disqualify--inline">
                                    {a.disqualify_reason}
                                  </span>
                                ) : (
                                  <span className="muted">—</span>
                                )}
                              </td>
                            )}
                            <td onClick={(e) => e.stopPropagation()}>
                              <Btn
                                size="sm"
                                variant="ghost"
                                icon="eye"
                                onClick={() => setCvPreview({ id: a.id, name: a.name || 'Applicant' })}
                              >
                                View
                              </Btn>
                            </td>
                          </tr>
                        ))
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {cvPreview && (
        <RecruiteeCvModal
          candidateId={cvPreview.id}
          candidateName={cvPreview.name}
          onClose={() => setCvPreview(null)}
        />
      )}

      {hasScreened && (
        <>
          {scoredError && (
            <div className="callout" style={{ fontSize: 12.5 }}>
              {scoredError}
            </div>
          )}
          {scoredLoading && (
            <div className="muted" style={{ fontSize: 12.5 }}>Loading screened candidates…</div>
          )}
          {!scoredLoading && rows.length > 0 && (
          <>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, flex: '1 1 300px' }}>
              <strong>{rows.length}</strong> scored candidate row{rows.length === 1 ? '' : 's'} across{' '}
              <strong>{completedRuns.length}</strong> completed run{completedRuns.length === 1 ? '' : 's'}
              {uniquePeople > 0 && (
                <>
                  {' · '}
                  <span className="mono">{uniquePeople}</span> distinct names
                </>
              )}
              . Click a row to open candidate details.
            </div>
            <div style={{ position: 'relative', flex: '0 1 260px', minWidth: 160 }}>
              <input
                className="inp"
                placeholder="Search screened candidates…"
                style={{ paddingLeft: 32, width: '100%' }}
                value={scoredQuery}
                onChange={(e) => setScoredQuery(e.target.value)}
                aria-label="Search screened candidates"
              />
              <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--muted)' }}/>
            </div>
          </div>

          <div className="card">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th style={{ width: 120 }}>Location</th>
                  <th style={{ width: 72 }} className="col-right">Score</th>
                  <th style={{ width: 100 }}>Confidence</th>
                  <th style={{ width: 130 }}>Status</th>
                  <th style={{ width: 140 }}>Run</th>
                  <th style={{ width: 110 }}>Date</th>
                  <th style={{ width: 36 }}/>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((row) =>
                    matchesTextQuery(scoredQuery, [
                      row.name,
                      row.title,
                      row.loc,
                      row.runId,
                      row.score != null ? String(row.score) : null,
                      row.status,
                    ]),
                  )
                  .map((row) => (
                  <tr
                    key={row.key}
                    className="is-clickable"
                    tabIndex={0}
                    role="button"
                    onClick={() => {
                      if (go && row.candidateId) {
                        go('results', { run: row.runId, candidate: row.candidateId });
                      } else if (go) {
                        go('results', row.runId);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (go && row.candidateId) {
                          go('results', { run: row.runId, candidate: row.candidateId });
                        } else if (go) {
                          go('results', row.runId);
                        }
                      }
                    }}
                    aria-label={
                      row.candidateId
                        ? `Open candidate ${row.name} in ${row.runId}`
                        : `Open run ${row.runId}`
                    }
                  >
                    <td>
                      <div style={{ fontWeight: 500, fontSize: 13.5 }}>{row.name}</div>
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>{row.title}</div>
                    </td>
                    <td className="muted">{row.loc}</td>
                    <td className="col-num col-right mono" style={{ fontSize: 12.5 }}>{row.score}</td>
                    <td><Confidence level={row.confidence}/></td>
                    <td><StatusBadge s={row.status}/></td>
                    <td className="mono muted" style={{ fontSize: 11.5 }}>{row.runId}</td>
                    <td className="mono" style={{ fontSize: 11.5 }}>{row.runDate}</td>
                    <td><Icon name="chevron-right" size={14} className="muted"/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
          )}
        </>
      )}
    </div>
  );
}

export { JobCandidatesPane }
