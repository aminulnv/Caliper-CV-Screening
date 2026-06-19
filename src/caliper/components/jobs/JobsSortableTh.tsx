// @ts-nocheck
import React from 'react'

export function JobsSortableTh({ label, sortKey, sortState, onSort, style, className }) {
  const active = sortState?.key === sortKey
  const dir = active ? sortState.dir : null
  return (
    <th
      className={[
        'tbl-sort-th',
        active ? 'tbl-sort-th--active' : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
      style={style}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" className="tbl-sort-btn" onClick={() => onSort(sortKey)}>
        <span>{label}</span>
        {active && (
          <span className="tbl-sort-indicator" aria-hidden>
            {dir === 'desc' ? '↓' : '↑'}
          </span>
        )}
      </button>
    </th>
  )
}
