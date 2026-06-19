// @ts-nocheck
import React from 'react'
import { Icon } from '@/caliper/ui'

export function JobsKpiStrip({ kpis }) {
  const { openCount, totalApplicants, totalRuns, needsCriteria } = kpis
  return (
    <div className="jobs-kpi-grid">
      <JobsKpi label="Open jobs" value={String(openCount)} icon="briefcase" tone="brand" />
      <JobsKpi label="Total applicants" value={String(totalApplicants)} icon="users" tone="info" />
      <JobsKpi label="Screening runs" value={String(totalRuns)} icon="history" tone="violet" />
      <JobsKpi
        label="Needs criteria"
        value={String(needsCriteria)}
        icon="sliders"
        tone={needsCriteria > 0 ? 'warn' : 'ok'}
      />
    </div>
  )
}

function JobsKpi({ label, value, icon, tone }) {
  return (
    <div className={`jobs-kpi jobs-kpi--${tone}`}>
      <div className="jobs-kpi__icon" aria-hidden>
        <Icon name={icon} size={18} />
      </div>
      <div>
        <div className="jobs-kpi__label">{label}</div>
        <div className="jobs-kpi__value">{value}</div>
      </div>
    </div>
  )
}
