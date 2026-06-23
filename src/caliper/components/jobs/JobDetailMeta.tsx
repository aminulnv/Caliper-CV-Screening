// @ts-nocheck
import React from 'react'
import { Icon } from '@/caliper/ui'

export function JobDetailMeta({ dept, postedOn, runsCount, lastUpdated }) {
  const items = [
    dept ? {
      key: 'dept',
      label: 'Department',
      value: dept,
      icon: 'briefcase',
    } : null,
    postedOn ? {
      key: 'posted',
      label: 'Posted',
      value: postedOn,
      icon: 'file',
    } : null,
    {
      key: 'runs',
      label: 'Screening runs',
      value: runsCount === 0 ? 'None yet' : String(runsCount),
      icon: 'play',
      muted: runsCount === 0,
    },
    lastUpdated ? {
      key: 'updated',
      label: 'Last updated',
      value: lastUpdated,
      icon: 'history',
    } : null,
  ].filter(Boolean)

  if (!items.length) return null

  return (
    <dl className="job-detail-meta">
      {items.map((item) => (
        <div key={item.key} className="job-detail-meta__item">
          <dt className="job-detail-meta__label">{item.label}</dt>
          <dd className={`job-detail-meta__value${item.muted ? ' job-detail-meta__value--muted' : ''}`}>
            <Icon name={item.icon} size={13} className="job-detail-meta__icon" aria-hidden />
            <span>{item.value}</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}
