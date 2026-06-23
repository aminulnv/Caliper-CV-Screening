// @ts-nocheck
import React from 'react'
import { KpiStrip } from '@/caliper/ui'

export function JobsKpiStrip({ kpis }) {
  const { openCount, totalApplicants, totalRuns, needsCriteria } = kpis
  return (
    <KpiStrip
      columns={4}
      items={[
        { key: 'open', label: 'Open jobs', value: String(openCount) },
        { key: 'applicants', label: 'Total applicants', value: String(totalApplicants) },
        { key: 'runs', label: 'Screening runs', value: String(totalRuns) },
        {
          key: 'criteria',
          label: 'Needs criteria',
          value: String(needsCriteria),
          tone: needsCriteria > 0 ? 'warn' : 'ok',
        },
      ]}
    />
  )
}
