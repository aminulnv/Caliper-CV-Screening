// @ts-nocheck
import React from 'react'
import { labelForModel } from '@/lib/screening-models'
import { JobsPanel } from '@/caliper/components/jobs/JobsPanel'
import { Btn, Chip, Icon, RunStatusBadge } from '@/caliper/ui'

function looksLikeHtml(text) {
  return typeof text === 'string' && /<[a-z][\s\S]*>/i.test(text);
}

const SummaryGroup = ({ kind, label, items }) => (
  <div style={{ marginBottom: 12 }}>
    <div className="eval-sec">
      <span>{label}</span>
      <span className="eval-sec__line"/>
      <span className="mono">{items.length}</span>
    </div>
    <div className="crit-chip-stack" style={{ marginBottom: 12 }}>
      {items.length === 0
        ? <span className="muted" style={{ fontSize: 12 }}>None yet</span>
        : items.map(it => <Chip key={it.id} kind={kind} name={it.name} weight={it.weight}/>)}
    </div>
  </div>
);

function OverviewPane({
  profile, desc, setDesc, savedMustHave, savedNiceToHave, savedRedFlags,
  screeningModel, runsToShow, go, onGoToCriteria, canEdit = true,
}) {
  const recentRuns = runsToShow.slice(0, 5);
  const savedMust = savedMustHave ?? [];
  const savedNice = savedNiceToHave ?? [];
  const savedFlags = savedRedFlags ?? [];

  return (
    <div className="overview-pane-grid">
      <div className="col" style={{ gap: 18 }}>
        <JobsPanel
          icon="doc"
          title="Job description"
          sub={profile.source === 'recruitee' ? `Synced from Recruitee · ${profile.sourceRef}` : 'Edit the description used for criteria generation.'}
        >
          {profile.source === 'recruitee' ? (
            looksLikeHtml(desc) ? (
              <div className="job-desc-html" dangerouslySetInnerHTML={{ __html: desc }} />
            ) : (
              <div className="job-desc-plain">{desc || 'No description available from Recruitee.'}</div>
            )
          ) : (
            <textarea
              className="ta job-desc-editor"
              rows={12}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              readOnly={!canEdit}
              disabled={!canEdit}
            />
          )}
        </JobsPanel>

        <JobsPanel
          icon="sliders"
          title="Criteria summary"
          actions={canEdit ? (
            <Btn size="sm" variant="ghost" icon="edit" onClick={() => onGoToCriteria && onGoToCriteria()}>Edit criteria</Btn>
          ) : null}
        >
          <SummaryGroup kind="must" label="Must-have" items={savedMust} />
          <SummaryGroup kind="nice" label="Nice-to-have" items={savedNice} />
          <SummaryGroup kind="flag" label="Red flags" items={savedFlags} />
          {savedMust.length + savedNice.length + savedFlags.length === 0 && (
            <div className="callout">
              {canEdit
                ? 'No criteria yet. Add them in the Criteria tab before starting a run.'
                : 'No saved criteria yet. Editors and admins configure criteria on the Criteria tab.'}
            </div>
          )}
        </JobsPanel>
      </div>

      <div className="col" style={{ gap: 14 }}>
        <JobsPanel icon="history" title="Recent runs" sub="Latest screening runs for this job." flush>
          {recentRuns.length === 0 && (
            <p className="muted jobs-panel__inset" style={{ fontSize: 13, paddingTop: 4, paddingBottom: 4 }}>
              {canEdit
                ? <>No runs yet. Use <strong>Run screening</strong> above to screen CVs for this job.</>
                : 'No runs yet. Editors and admins can start screening runs for this job.'}
            </p>
          )}
          {recentRuns.map((r, i) => (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              className="overview-run-row"
              onClick={() => go && go('results', r.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  go && go('results', r.id);
                }
              }}
              style={{ borderTop: i ? '1px solid var(--line-soft)' : 'none' }}
            >
              <div className="row" style={{ justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <div className="mono muted overview-run-row__id">{r.id}</div>
                {r.status && r.status !== 'completed' && (
                  <RunStatusBadge s={r.status} />
                )}
              </div>
              <div className="row" style={{ gap: 8, marginTop: 4 }}>
                <span className="mono tnum" style={{ fontSize: 13 }}>{r.date}</span>
                <span className="muted" style={{ fontSize: 13 }}>· {r.cvs} CVs</span>
              </div>
              {r.scoreRange && (
                <div className="row" style={{ marginTop: 6, gap: 6 }}>
                  <span className="mono tnum" style={{ fontSize: 12 }}>{r.scoreRange[0]}</span>
                  <span
                    className="overview-run-row__bar"
                    style={{
                      background: `linear-gradient(90deg, var(--bad) 0%, var(--warn) ${r.scoreRange[0]}%, var(--ok) ${r.scoreRange[1]}%, var(--line-soft) ${r.scoreRange[1]}%)`,
                    }}
                  />
                  <span className="mono tnum" style={{ fontSize: 12 }}>{r.scoreRange[1]}</span>
                </div>
              )}
            </div>
          ))}
          {runsToShow.length > recentRuns.length && (
            <p className="muted jobs-panel__inset" style={{ fontSize: 12, paddingTop: 8, paddingBottom: 4 }}>
              Showing {recentRuns.length} of {runsToShow.length} runs. Open the Runs tab for the full list.
            </p>
          )}
        </JobsPanel>

        <JobsPanel icon="info" title="Quick facts">
            <div className="row" style={{ gap: 12, marginBottom: 10 }}>
              <span className="muted mono" style={{ fontSize: 11, width: 80 }}>Job title</span>
              <span style={{ fontSize: 12.5, fontWeight: 500 }}>{profile.name?.trim() || 'Untitled job'}</span>
            </div>
            <div className="row" style={{ gap: 12, marginBottom: 10 }}>
              <span className="muted mono" style={{ fontSize: 11, width: 80 }}>Posted</span>
              <span style={{ fontSize: 12.5 }}>{profile.postedOn ?? '—'}</span>
            </div>
            <div className="row" style={{ gap: 12, marginBottom: 10 }}>
              <span className="muted mono" style={{ fontSize: 11, width: 80 }}>Department</span>
              <span style={{ fontSize: 12.5 }}>{profile.dept || '—'}</span>
            </div>
            <div className="row" style={{ gap: 12, marginBottom: 10 }}>
              <span className="muted mono" style={{ fontSize: 11, width: 80 }}>Source</span>
              <span style={{ fontSize: 12.5 }}>
                {profile.source === 'recruitee' ? `Recruitee · ${profile.sourceRef}` : 'Manually added'}
              </span>
            </div>
            {screeningModel && (
              <div className="row" style={{ gap: 12, marginBottom: 10 }}>
                <span className="muted mono" style={{ fontSize: 11, width: 80 }}>Model</span>
                <span style={{ fontSize: 12.5 }}>{labelForModel(screeningModel)}</span>
              </div>
            )}
            <div className="row" style={{ gap: 12 }}>
              <span className="muted mono" style={{ fontSize: 11, width: 80 }}>Last edit</span>
              <span style={{ fontSize: 12.5 }}>{profile.lastUpdated ?? '—'}</span>
            </div>
            {profile.source === 'recruitee' && profile.applicantsCount != null && (
              <div className="row" style={{ gap: 12, marginTop: 10 }}>
                <span className="muted mono" style={{ fontSize: 11, width: 80 }}>Applicants</span>
                <span className="mono" style={{ fontSize: 12.5 }}>{profile.applicantsCount}</span>
              </div>
            )}
        </JobsPanel>
      </div>
    </div>
  );
}

export { OverviewPane }
