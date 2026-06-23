// @ts-nocheck
/** Shared page layout primitives — single visual language for list/detail pages. */
import React from 'react'
import { Icon } from '@/caliper/ui'

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  hideTitle = false,
  className = '',
}) {
  return (
    <header className={`page-header ${className}`.trim()}>
      <div className="page-header__main">
        {eyebrow && <p className="page__eyebrow">{eyebrow}</p>}
        {title && !hideTitle && (
          <h1 className="page__title" style={{ marginBottom: subtitle ? 6 : 0 }}>{title}</h1>
        )}
        {subtitle && <p className="page__sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  )
}

export function KpiStrip({ items, columns, className = '' }) {
  if (!items?.length) return null
  const colClass = columns ? `stats--${columns}` : ''
  return (
    <div className={`stats ${colClass} ${className}`.trim()} style={{ marginBottom: 20 }}>
      {items.map((item) => (
        <KpiCell key={item.key ?? item.label} {...item} />
      ))}
    </div>
  )
}

function KpiCell({
  label,
  value,
  sub,
  tone = 'default',
  clickable = false,
  active = false,
  onClick,
  title,
}) {
  const className = [
    'stats__cell',
    clickable ? 'stats__cell--clickable' : '',
    active ? 'stats__cell--active' : '',
    tone !== 'default' ? `stats__cell--${tone}` : '',
  ].filter(Boolean).join(' ')

  const inner = (
    <>
      <div className="stats__lbl">{label}</div>
      <div className="stats__val">{value}</div>
      {sub && <div className="stats__sub muted">{sub}</div>}
    </>
  )

  if (clickable && onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        aria-pressed={active}
        title={title ?? (active ? 'Show all candidates' : `Show only ${label.toLowerCase()}`)}
      >
        {inner}
      </button>
    )
  }

  return <div className={className}>{inner}</div>
}

export function PageToolbar({ children, className = '' }) {
  return (
    <div className={`page-toolbar row ${className}`.trim()}>
      {children}
    </div>
  )
}

export function PageToolbarSearch({
  value,
  onChange,
  placeholder,
  ariaLabel = 'Search',
  className = '',
}) {
  return (
    <div className={`page-toolbar__search ${className}`.trim()}>
      <Icon name="search" size={14} className="page-toolbar__search-icon" aria-hidden />
      <input
        className="inp page-toolbar__search-input"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
    </div>
  )
}

export function DataTable({
  children,
  variant = 'default',
  className = '',
  wrapClassName = '',
}) {
  const tableClass = variant === 'jobs' ? 'jobs-table' : 'tbl'
  const wrapClass = variant === 'jobs' ? 'jobs-table-wrap' : 'tbl-wrap'
  return (
    <div className={`${wrapClass} ${wrapClassName}`.trim()}>
      <table className={`${tableClass} ${className}`.trim()}>
        {children}
      </table>
    </div>
  )
}

export function TableSkeleton({ rows = 6, columns = 5 }) {
  return (
    <div className="table-skeleton" aria-busy="true" aria-label="Loading table">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="table-skeleton__row">
          {Array.from({ length: columns }, (_, col) => (
            <div
              key={col}
              className={`table-skeleton__cell${col === 0 ? ' table-skeleton__cell--wide' : ''}`}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function ListCardSkeleton({ count = 4 }) {
  return (
    <div className="list-card-skeleton" aria-busy="true" aria-label="Loading list">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="list-card-skeleton__card">
          <div className="list-card-skeleton__line list-card-skeleton__line--title" />
          <div className="list-card-skeleton__line" />
          <div className="list-card-skeleton__line list-card-skeleton__line--short" />
        </div>
      ))}
    </div>
  )
}

export function FilterChips({ chips }) {
  if (!chips?.length) return null
  return (
    <div className="filter-chips" role="list" aria-label="Active filters">
      {chips.map((chip) => (
        <span key={chip.key} className="filter-chips__chip" role="listitem">
          <span className="filter-chips__label">{chip.label}</span>
          {chip.onRemove && (
            <button
              type="button"
              className="filter-chips__remove"
              onClick={chip.onRemove}
              aria-label={chip.removeLabel ?? `Remove ${chip.label} filter`}
            >
              <Icon name="x" size={12} aria-hidden />
            </button>
          )}
        </span>
      ))}
    </div>
  )
}

const WEIGHT_MAX = 10

export function CriterionWeightBar({ weight, kind = 'must' }) {
  const pct = Math.max(8, Math.min(100, (weight / WEIGHT_MAX) * 100))
  return (
    <div className={`criterion-weight-bar criterion-weight-bar--${kind}`} aria-hidden>
      <div className="criterion-weight-bar__fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function ScoreTrustCard({
  score,
  must,
  nice,
  flag,
  confidence,
  variant = 'stacked',
  className = '',
}) {
  return (
    <div className={`score-trust-card ${className}`.trim()}>
      <div className="score-trust-card__main">
        <span className="score-trust-card__score mono">{score}</span>
        <div className="score-trust-card__bar-wrap">
          {/* ScoreBar imported at call site to avoid circular deps — use inline mini bar */}
          <div className="scorebar score-trust-card__bar">
            <span className="scorebar__track">
              <span className="scorebar__seg scorebar__seg--ok" style={{ width: `${Math.min(70, (must || 0) * 14)}%` }} />
              <span className="scorebar__seg scorebar__seg--warn" style={{ width: `${Math.min(20, (nice || 0) * 5)}%` }} />
              <span className="scorebar__seg scorebar__seg--bad" style={{ width: `${Math.min(20, (flag || 0) * 8)}%` }} />
            </span>
          </div>
          <span className="mono muted score-trust-card__breakdown">{must}·{nice}·{flag}</span>
        </div>
      </div>
      {confidence && (
        <span className={`score-trust-card__conf conf conf--${confidence}`}>
          {confidence} confidence
        </span>
      )}
    </div>
  )
}
