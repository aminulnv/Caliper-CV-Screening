// @ts-nocheck
import React from 'react'
import { KpiStrip } from '@/caliper/ui-layout'

export function ResultsStatsStrip({
  nStrong,
  nPromising,
  nReviewOrFlag,
  meanConfPct,
  filterStatus,
  onToggleStatFilter,
}) {
  return (
    <KpiStrip
      columns={4}
      className="results-page__stats"
      items={[
        {
          key: 'strong',
          label: 'Strong matches',
          value: String(nStrong),
          sub: '· ≥ 85',
          tone: 'ok',
          clickable: nStrong > 0,
          active: filterStatus === 'strong',
          onClick: () => onToggleStatFilter('strong'),
        },
        {
          key: 'promising',
          label: 'Promising',
          value: String(nPromising),
          sub: '· 65 – 84',
          tone: 'info',
          clickable: nPromising > 0,
          active: filterStatus === 'promising',
          onClick: () => onToggleStatFilter('promising'),
        },
        {
          key: 'review_flagged',
          label: 'Review / flagged',
          value: String(nReviewOrFlag),
          sub: '· parse warnings / flags',
          tone: 'warn',
          clickable: nReviewOrFlag > 0,
          active: filterStatus === 'review_flagged',
          onClick: () => onToggleStatFilter('review_flagged'),
        },
        {
          key: 'mean_conf',
          label: 'Mean confidence',
          value: `${meanConfPct}%`,
          sub: '· across all criteria',
          tone: 'default',
        },
      ]}
    />
  );
}
