// @ts-nocheck
import React from 'react'
import { Btn, Icon } from '@/caliper/ui'
import { ActivityLogList } from '@/caliper/components/ActivityLogList'
import { api } from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'

const FILTERS = [
  { value: 'all', label: 'All', icon: 'list', tone: 'brand' },
  { value: 'screening', label: 'Screening', icon: 'play', tone: 'brand' },
  { value: 'criteria', label: 'Criteria', icon: 'sliders', tone: 'violet' },
  { value: 'candidates', label: 'Candidates', icon: 'users', tone: 'ok' },
  { value: 'recruitee', label: 'Recruitee', icon: 'database', tone: 'info' },
  { value: 'jobs', label: 'Jobs', icon: 'doc', tone: 'neutral' },
]

function groupForKind(kind) {
  switch (kind) {
    case 'run': return 'screening'
    case 'criteria': return 'criteria'
    case 'candidate':
    case 'override': return 'candidates'
    case 'sync': return 'recruitee'
    default: return 'jobs'
  }
}

function ActivityStatCard({ label, value, icon, tone }) {
  return (
    <div className={`activity-stat activity-stat--${tone}`}>
      <div className="activity-stat__icon" aria-hidden>
        <Icon name={icon} size={18} />
      </div>
      <div className="activity-stat__content">
        <div className="activity-stat__label">{label}</div>
        <div className="activity-stat__value">{value}</div>
      </div>
    </div>
  )
}

function ActivityPage() {
  const { isAdmin } = useAuth()
  const [entries, setEntries] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [filter, setFilter] = React.useState('all')

  const load = React.useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    api.activity
      .list(200)
      .then((res) => {
        if (cancelled) return
        setEntries(res.entries ?? [])
      })
      .catch((e) => {
        if (cancelled) return
        setError(e?.message ?? 'Failed to load activity')
        setEntries([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  React.useEffect(() => load(), [load])

  const stats = React.useMemo(() => {
    const jobs = new Set()
    const people = new Set()
    const counts = { all: entries.length, screening: 0, criteria: 0, candidates: 0, recruitee: 0, jobs: 0 }
    for (const e of entries) {
      if (e.jobId) jobs.add(e.jobId)
      if (e.who) people.add(e.who)
      const group = groupForKind(e.kind)
      counts[group] += 1
    }
    return {
      total: entries.length,
      jobs: jobs.size,
      people: people.size,
      counts,
    }
  }, [entries])

  const shown = React.useMemo(
    () => (filter === 'all' ? entries : entries.filter((e) => groupForKind(e.kind) === filter)),
    [entries, filter],
  )

  if (loading) {
    return (
      <div className="page activity-page">
        <div className="activity-page__loading muted">Loading activity…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page activity-page">
        <div className="activity-page__error" role="alert">{error}</div>
        <Btn variant="ghost" icon="history" onClick={load} style={{ marginTop: 12 }}>Try again</Btn>
      </div>
    )
  }

  return (
    <div className="page activity-page">
      <header className="activity-page__intro">
        <div>
          <p className="page__eyebrow">Audit trail</p>
          <h1 className="page__title" style={{ marginBottom: 6 }}>
            {isAdmin ? 'Platform activity' : 'Your activity'}
          </h1>
          <p className="page__sub">
            {isAdmin
              ? 'Screening runs, criteria changes, candidate decisions, and Recruitee syncs across every job.'
              : 'Your screening runs, criteria changes, candidate decisions, and Recruitee syncs.'}
          </p>
        </div>
        <Btn variant="ghost" icon="history" onClick={load}>Refresh</Btn>
      </header>

      <div className="activity-stats">
        <ActivityStatCard label="Activities" value={stats.total} icon="history" tone="brand" />
        <ActivityStatCard label="Jobs involved" value={stats.jobs || '—'} icon="briefcase" tone="info" />
        {isAdmin && (
          <ActivityStatCard label="People active" value={stats.people || '—'} icon="users" tone="ok" />
        )}
      </div>

      <div className="activity-filters" role="tablist" aria-label="Filter activity">
        {FILTERS.map((f) => {
          const count = stats.counts[f.value]
          const active = filter === f.value
          return (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={active}
              className={`activity-filter activity-filter--${f.tone}${active ? ' activity-filter--active' : ''}`}
              onClick={() => setFilter(f.value)}
            >
              <Icon name={f.icon} size={13} />
              <span>{f.label}</span>
              <span className="activity-filter__count">{count}</span>
            </button>
          )
        })}
      </div>

      <section className="activity-panel" aria-labelledby="activity-feed-heading">
        <div className="activity-panel__head">
          <Icon name="history" size={15} className="muted" aria-hidden />
          <h2 id="activity-feed-heading" className="activity-panel__title">
            Recent events
          </h2>
          <div className="spacer" />
          <span className="activity-panel__meta mono">
            {shown.length} {shown.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
        <div className="activity-panel__body">
          <ActivityLogList
            entries={shown}
            emptyMessage={
              filter === 'all'
                ? (isAdmin
                  ? 'Screening runs, criteria changes, candidate decisions, and Recruitee syncs across every job are recorded here automatically.'
                  : 'Your screening runs, criteria changes, candidate decisions, and Recruitee syncs are recorded here automatically.')
                : `No ${FILTERS.find((f) => f.value === filter)?.label ?? 'matching'} activity in this window. Try another filter or refresh.`
            }
          />
        </div>
      </section>
    </div>
  )
}

export default ActivityPage
