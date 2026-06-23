// @ts-nocheck
import React from 'react'
import { Icon, Btn } from '@/caliper/ui'

export function ResultsStatusBanners({
  pollError,
  jobMetaError,
  run,
  candidates,
  onRetryPoll,
}) {
  return (
    <>
      {pollError && (
        <div className="results-banner results-banner--warn" role="alert">
          <Icon name="alert" size={16} aria-hidden />
          <span>{pollError}</span>
          <Btn size="sm" variant="ghost" onClick={onRetryPoll}>Retry</Btn>
        </div>
      )}

      {jobMetaError && (
        <div className="results-banner results-banner--warn" role="alert">
          <Icon name="alert" size={16} aria-hidden />
          <span>{jobMetaError}</span>
        </div>
      )}

      {(run.status === 'in_progress' || run.status === 'queued') && (
        <div className="results-banner results-banner--progress">
          <Icon name="sparkle" size={18} className="results-banner--progress__icon" aria-hidden />
          <div className="results-banner--progress__body">
            <div className="results-banner--progress__title">
              Screening in progress
            </div>
            <div className="results-banner--progress__sub muted">
              {candidates.length} of {run.cv_count ?? candidates.length} CV{candidates.length === 1 ? '' : 's'} scored so far — results update automatically.
            </div>
          </div>
        </div>
      )}

      {run.status === 'failed' && run.error_message && (
        <div className="results-banner results-banner--failed">
          <div className="results-banner--failed__title">Run failed</div>
          <div className="results-banner--failed__message">{run.error_message}</div>
        </div>
      )}

      {run.run_note && (
        <div className="results-banner results-banner--note">
          <div className="results-banner--note__label">Run note</div>
          <div className="results-banner--note__body">{run.run_note}</div>
        </div>
      )}
    </>
  );
}
