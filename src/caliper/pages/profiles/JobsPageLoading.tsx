// @ts-nocheck
import React from 'react'
import { Btn, PageError, PageLoading } from '@/caliper/ui'

/** Jobs list loading / error shell — extracted from ProfilesPage for maintainability. */
export function JobsPageLoading({ phase, onRetry }) {
  if (onRetry && phase && !phase.includes('…') && !phase.includes('Loading')) {
    return (
      <div className="page">
        <div className="card">
          <PageError message={phase} onRetry={onRetry} />
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="card">
        <PageLoading title="Loading jobs" message={phase} />
      </div>
      {onRetry && (
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <Btn variant="default" onClick={onRetry}>Try again</Btn>
        </div>
      )}
    </div>
  )
}
