// @ts-nocheck
import React from 'react'

const CRITERIA_KIND_BADGE_BG = {
  must: 'var(--ok)',
  nice: 'var(--warn)',
  flag: 'var(--bad)',
}

const CRITERIA_KIND_BADGE_LABEL = {
  must: 'must-have',
  nice: 'nice-to-have',
  flag: 'red flag',
}

export function CriteriaKindCountBadge({ count, kind }) {
  if (count <= 0) return null
  const bg = CRITERIA_KIND_BADGE_BG[kind] || 'var(--muted)'
  const kindLabel = CRITERIA_KIND_BADGE_LABEL[kind] || 'criteria'
  const label = `${count} ${kindLabel}${count === 1 ? '' : 's'}`
  return (
    <span
      className="mono criteria-kind-count-badge"
      role="img"
      aria-label={label}
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 9999,
        background: bg,
        color: '#fff',
        fontWeight: 600,
        lineHeight: 1,
        boxSizing: 'border-box',
      }}
    >
      {count}
    </span>
  )
}
