import React from 'react';
import type { RecruiteeApplicant, RecruiteePipelineStage } from '@/services/api';
import { Icon } from '@/caliper/ui';
import { RecruiteeEvalBadge } from '@/caliper/components/RecruiteeEvalBadge';
import { DispositionBadge } from '@/caliper/components/DispositionBadge';
import { sortApplicantsByEval, type EvalSortMode } from '@/lib/recruitee-eval-sort';
import type { CandidateDisposition } from '@/services/api';

export type { EvalSortMode };
export type PipelineView = 'qualified' | 'disqualified';

function applicantInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatRelativeDays(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 1) return 'NEW';
  return `${days}d`;
}

function stageCategoryKey(category: string | null): string {
  if (!category) return 'other';
  const key = category.toLowerCase();
  if (key === 'applicants' || key === 'active' || key === 'hires') return key;
  return 'other';
}

export function RecruiteePipelineTabs({
  pipelineView,
  onPipelineViewChange,
  qualifiedCount,
  disqualifiedCount,
}: {
  pipelineView: PipelineView;
  onPipelineViewChange: (view: PipelineView) => void;
  qualifiedCount: number;
  disqualifiedCount: number;
}) {
  return (
    <div className="pipeline-tabs" role="tablist" aria-label="Applicant qualification">
      <button
        type="button"
        role="tab"
        aria-selected={pipelineView === 'qualified'}
        className={`pipeline-tab${pipelineView === 'qualified' ? ' is-active' : ''}`}
        onClick={() => onPipelineViewChange('qualified')}
      >
        Qualified
        <span className="pipeline-tab__count">{qualifiedCount}</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={pipelineView === 'disqualified'}
        className={`pipeline-tab${pipelineView === 'disqualified' ? ' is-active' : ''}`}
        onClick={() => onPipelineViewChange('disqualified')}
      >
        Disqualified
        <span className="pipeline-tab__count">{disqualifiedCount}</span>
      </button>
    </div>
  );
}

function ApplicantAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  if (photoUrl) {
    return (
      <img
        className="cand-card__avatar"
        src={photoUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }
  return <span className="cand-card__avatar cand-card__avatar--initials">{applicantInitials(name)}</span>;
}

export type ApplicantDispositionOverlay = {
  disposition: CandidateDisposition;
  target_stage_name?: string | null;
  recruitee_sync_status?: string | null;
};

export function RecruiteePipelineBoard({
  stages,
  applicants,
  pipelineView,
  sortMode = 'default',
  hideEmptyColumns = false,
  canEdit = true,
  dispositionByApplicantId,
  onView,
  onScreenStage,
}: {
  stages: RecruiteePipelineStage[];
  applicants: RecruiteeApplicant[];
  pipelineView: PipelineView;
  sortMode?: EvalSortMode;
  hideEmptyColumns?: boolean;
  canEdit?: boolean;
  dispositionByApplicantId?: Map<string, ApplicantDispositionOverlay>;
  onView: (applicant: RecruiteeApplicant) => void;
  onScreenStage?: (stageName: string) => void;
}) {
  const visibleApplicants = React.useMemo(
    () =>
      applicants.filter((a) =>
        pipelineView === 'qualified' ? !a.disqualified : a.disqualified,
      ),
    [applicants, pipelineView],
  );

  const columns = React.useMemo(
    () =>
      stages.map((stage) => ({
        stage,
        items: sortApplicantsByEval(
          visibleApplicants.filter((a) => a.stage_id === stage.id),
          sortMode,
        ),
      })),
    [stages, visibleApplicants, sortMode],
  );

  const displayColumns = hideEmptyColumns
    ? columns.filter((col) => col.items.length > 0)
    : columns;

  const showScreen = onScreenStage && pipelineView === 'qualified';

  return (
    <div className="cand-board" role="list" aria-label="Applicants by pipeline stage">
      {displayColumns.length === 0 && hideEmptyColumns ? (
        <div className="muted" style={{ fontSize: 12.5, padding: '12px 4px' }}>
          No applicants match your search in this view.
        </div>
      ) : null}
      {displayColumns.map(({ stage, items }, ci) => (
        <section
          className="cand-col"
          role="listitem"
          key={stage.id}
          style={{ ['--col-index' as string]: ci }}
        >
          <header className="cand-col__head">
            <span className="cand-col__title">
              <span
                className="cand-col__dot"
                data-category={stageCategoryKey(stage.category)}
              />
              <span className="cand-col__title-text" title={stage.name}>
                {stage.name}
              </span>
            </span>
            <span className="cand-col__count">{items.length}</span>
            {showScreen && items.length > 0 && (
              canEdit ? (
                <button
                  type="button"
                  className="cand-col__screen"
                  onClick={() => onScreenStage(stage.name)}
                  title={`Run screening on the ${items.length} applicant${items.length === 1 ? '' : 's'} in “${stage.name}”`}
                >
                  <Icon name="play" size={11} /> Screen
                </button>
              ) : (
                <span className="cand-col__screen-wrap run-screening-locked run-screening-locked--inline">
                  <button
                    type="button"
                    className="cand-col__screen cand-col__screen--locked"
                    disabled
                    aria-disabled="true"
                    aria-label="Screen (view-only)"
                  >
                    <Icon name="lock" size={11} /> Screen
                  </button>
                  <p className="run-screening-locked__hint" role="note">
                    View-only access. Editors and admins can run screenings.
                  </p>
                </span>
              )
            )}
          </header>
          <div className="cand-col__body">
            {items.length === 0 ? (
              <div className="cand-col__empty">No applicants</div>
            ) : (
              items.map((a) => {
                const age = formatRelativeDays(a.created_at);
                const caliperDisposition = dispositionByApplicantId?.get(String(a.id));
                return (
                  <article className="cand-card" key={a.id}>
                    <div className="cand-card__top">
                      <ApplicantAvatar name={a.name || 'Unknown'} photoUrl={a.photo_url} />
                      <div className="cand-card__main">
                        <div className="cand-card__name-row">
                          <div className="cand-card__name">{a.name || 'Unknown'}</div>
                          {caliperDisposition && (
                            <DispositionBadge
                              disposition={caliperDisposition.disposition}
                              targetStageName={caliperDisposition.target_stage_name}
                              syncStatus={caliperDisposition.recruitee_sync_status}
                              compact
                              recruiteePipeline
                            />
                          )}
                          {age && pipelineView === 'qualified' && (
                            <span className={`cand-card__age${age === 'NEW' ? ' is-new' : ''}`}>
                              {age}
                            </span>
                          )}
                        </div>
                        {pipelineView === 'disqualified' && a.disqualify_reason && (
                          <div className="cand-card__disqualify">
                            <Icon name="ban" size={11} />
                            {a.disqualify_reason}
                          </div>
                        )}
                        <div className="cand-card__meta">
                          <span className="cand-card__loc">
                            {a.location ? (
                              <>
                                <Icon name="map-pin" size={11} />
                                {a.location}
                              </>
                            ) : (
                              '—'
                            )}
                          </span>
                          {pipelineView === 'qualified' && (
                            <button
                              type="button"
                              className="cand-card__cv"
                              onClick={() => onView(a)}
                              aria-label={`View CV for ${a.name || 'applicant'}`}
                            >
                              <Icon name="eye" size={11} /> CV
                            </button>
                          )}
                        </div>
                        {a.evaluation_score != null && (
                          <div className="cand-card__eval-row">
                            <RecruiteeEvalBadge score={a.evaluation_score} />
                          </div>
                        )}
                      </div>
                    </div>
                    {pipelineView === 'disqualified' && a.cv_url && (
                      <div className="cand-card__footer">
                        <button
                          type="button"
                          className="cand-card__cv"
                          onClick={() => onView(a)}
                          aria-label={`View CV for ${a.name || 'applicant'}`}
                        >
                          <Icon name="eye" size={11} /> CV
                        </button>
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

export function filterApplicantsByPipelineView(
  applicants: RecruiteeApplicant[],
  pipelineView: PipelineView,
): RecruiteeApplicant[] {
  return applicants.filter((a) =>
    pipelineView === 'qualified' ? !a.disqualified : a.disqualified,
  );
}

export function buildPipelineListGroups(
  stages: RecruiteePipelineStage[],
  applicants: RecruiteeApplicant[],
  pipelineView: PipelineView,
  sortMode: EvalSortMode = 'default',
): { stage: RecruiteePipelineStage; items: RecruiteeApplicant[] }[] {
  const visible = filterApplicantsByPipelineView(applicants, pipelineView);
  return stages.map((stage) => ({
    stage,
    items: sortApplicantsByEval(
      visible.filter((a) => a.stage_id === stage.id),
      sortMode,
    ),
  }));
}
