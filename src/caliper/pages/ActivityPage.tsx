// @ts-nocheck
import React from 'react'
import { Badge, Btn, Icon, Segmented } from '@/caliper/ui'
import { api } from '@/services/api'
import { useCaliperGo } from '@/caliper/CaliperNavContext'
import { useAuth } from '@/contexts/AuthContext'

const KIND_META = {
  criteria: { icon: 'sliders', label: 'Criteria' },
  run: { icon: 'play', label: 'Screening' },
  override: { icon: 'edit', label: 'Override' },
  candidate: { icon: 'users', label: 'Candidate' },
  job: { icon: 'doc', label: 'Job' },
  sync: { icon: 'database', label: 'Recruitee' },
  other: { icon: 'history', label: 'Activity' },
}

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'screening', label: 'Screening' },
  { value: 'criteria', label: 'Criteria' },
  { value: 'candidates', label: 'Candidates' },
  { value: 'recruitee', label: 'Recruitee' },
  { value: 'jobs', label: 'Jobs' },
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

function StatCell({ label, value }) {
  return (
    <div className="stats__cell">
      <div className="stats__lbl">{label}</div>
      <div className="stats__val">{value}</div>
    </div>
  )
}

function ActivityPage() {
  const go = useCaliperGo()
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
    for (const e of entries) {
      if (e.jobId) jobs.add(e.jobId)
      if (e.who) people.add(e.who)
    }
    return { total: entries.length, jobs: jobs.size, people: people.size }
  }, [entries])

  const shown = React.useMemo(
    () => (filter === 'all' ? entries : entries.filter((e) => groupForKind(e.kind) === filter)),
    [entries, filter],
  )

  if (loading) {
    return <div className="page"><div className="muted" style={{ padding: 32 }}>Loading activity…</div></div>
  }
  if (error) {
    return <div className="page"><div style={{ color: 'var(--bad)', padding: 32 }}>{error}</div></div>
  }

  return (
    <div className="page">
      <div className="stats" style={{ marginTop: 20, marginBottom: 24 }}>
        <StatCell label="Activities" value={stats.total} />
        <StatCell label="Jobs involved" value={stats.jobs || '—'} />
        {isAdmin && <StatCell label="People active" value={stats.people || '—'} />}
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <Segmented value={filter} onChange={setFilter} options={FILTERS} />
        <div className="spacer" />
        <Btn size="sm" variant="ghost" onClick={load}>Refresh</Btn>
      </div>

      <div className="card">
        <div className="card__head">
          <Icon name="history" size={14} className="muted" />
          <span className="card__title">{isAdmin ? 'Platform activity' : 'Your activity'}</span>
          <div className="spacer" />
          <span className="mono muted" style={{ fontSize: 11 }}>
            {`${shown.length} ${shown.length === 1 ? 'entry' : 'entries'}`}
          </span>
        </div>
        <div className="card__body" style={{ paddingTop: 4 }}>
          {shown.length === 0 && (
            <div className="empty" style={{ padding: '24px 18px' }}>
              <Icon name="history" size={22} />
              <div style={{ marginTop: 8, fontSize: 14, color: 'var(--ink)' }}>No activity yet</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4, maxWidth: '54ch', lineHeight: 1.55 }}>
                {isAdmin
                  ? 'Screening runs, criteria changes, candidate decisions, and Recruitee syncs across every job are recorded here automatically.'
                  : 'Your screening runs, criteria changes, candidate decisions, and Recruitee syncs are recorded here automatically.'}
              </div>
            </div>
          )}
          {shown.length > 0 && (
            <div className="log">
              {shown.map((a) => {
                const meta = KIND_META[a.kind] ?? KIND_META.other
                return (
                  <div key={a.id} className={`log__row log__row--${a.kind}`}>
                    <div className="log__ts">{a.ts}</div>
                    <div className="log__main">
                      <div className="log__kind">
                        <Icon name={meta.icon} size={12} className="muted" />
                        <span>{meta.label}</span>
                        {a.jobName && (
                          <>
                            <span aria-hidden="true" style={{ color: 'var(--line)' }}>·</span>
                            <button
                              type="button"
                              className="linkish"
                              style={{ font: 'inherit', textTransform: 'none', letterSpacing: 0, color: 'var(--subtle)' }}
                              onClick={() => a.jobId && go('profiles', { job: a.jobId })}
                              title={`Open ${a.jobName}`}
                            >
                              {a.jobName}
                            </button>
                          </>
                        )}
                      </div>
                      <div className="log__msg">
                        <b>{a.who}</b> {a.msg}
                        {a.warned && (
                          <Badge tone="warn" style={{ marginLeft: 8, verticalAlign: 'middle' }}>
                            Bias criteria
                          </Badge>
                        )}
                      </div>
                      {a.reason !== '—' && (
                        <div className="log__reason muted">Reason: {a.reason}</div>
                      )}
                      {a.runId && (
                        <button
                          type="button"
                          className="linkish log__link"
                          onClick={() => go('results', a.runId)}
                        >
                          View run →
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ActivityPage
