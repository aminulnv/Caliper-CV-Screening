// @ts-nocheck
import React from 'react'
import { Btn, PageError, PageHeader, TableSkeleton, ListCardSkeleton } from '@/caliper/ui'

/** Jobs list loading / error shell — skeleton placeholders match list layout. */
export function JobsPageLoading({ phase, onRetry }) {
  if (onRetry && phase && !phase.includes('…') && !phase.includes('Loading')) {
    return (
      <div className="page jobs-page">
        <div className="card">
          <PageError message={phase} onRetry={onRetry} />
        </div>
      </div>
    )
  }

  return (
    <div className="page jobs-page" aria-busy="true">
      <PageHeader eyebrow="Recruiting" hideTitle subtitle={phase} />
      <div className="stats stats--4" style={{ marginBottom: 20 }} aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="stats__cell">
            <div className="table-skeleton__cell" style={{ width: '60%', marginBottom: 8 }} />
            <div className="table-skeleton__cell" style={{ width: '40%', height: 20 }} />
          </div>
        ))}
      </div>
      <div className="jobs-panel jobs-panel--flush">
        <div className="jobs-table-wrap jobs-table-wrap--desktop">
          <TableSkeleton rows={8} columns={5} />
        </div>
        <div className="jobs-list-cards jobs-list-cards--mobile">
          <ListCardSkeleton count={5} />
        </div>
      </div>
      {onRetry && (
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <Btn variant="default" onClick={onRetry}>Try again</Btn>
        </div>
      )}
    </div>
  )
}
