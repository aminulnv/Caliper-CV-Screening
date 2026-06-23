import React from 'react'
import { Link } from 'react-router-dom'
import { Badge, Icon, PageError, PageLoading } from '@/caliper/ui'
import { ActivityLogList } from '@/caliper/components/ActivityLogList'
import { useAuth } from '@/contexts/AuthContext'
import { creditsStatusLabel } from '@/lib/credits-display'
import { labelForRole } from '@/lib/roles'
import { api, type BudgetStatus, type ProfileResponse } from '@/services/api'

function formatCount(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '—'
  return n.toLocaleString()
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatRelativeActive(dateStr: string): string {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return '—'
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return 'Last active today'
  if (diffDays === 1) return 'Last active yesterday'
  if (diffDays < 7) return `Last active ${diffDays} days ago`
  return `Last active ${formatDate(dateStr)}`
}

function formatUsd(amount: number): string {
  const n = Number(amount)
  if (!Number.isFinite(n)) return '—'
  if (n === 0) return '$0.00'
  if (n < 0.01) return `$${n.toFixed(4)}`
  if (n < 1) return `$${n.toFixed(3)}`
  return `$${n.toFixed(2)}`
}

function formatPct(pct: number | null): string {
  if (pct == null) return '—'
  return `${pct}%`
}

function statusTone(status: BudgetStatus): string {
  if (status === 'blocked') return 'bad'
  if (status === 'warn') return 'warn'
  if (status === 'unlimited') return 'ghost'
  return 'ok'
}

function statusLabel(status: BudgetStatus): string {
  return creditsStatusLabel(status)
}

function usagePct(spent: number, budget: number | null): number | null {
  if (budget == null || budget <= 0) return null
  return Math.min(100, Math.round((spent / budget) * 1000) / 10)
}

function budgetRemaining(spent: number, budget: number | null): number | null {
  if (budget == null || budget <= 0) return null
  return Math.max(0, budget - spent)
}

function UsageMeter({
  spent,
  budget,
  status,
  size = 'md',
}: {
  spent: number
  budget: number | null
  status: BudgetStatus
  size?: 'md' | 'lg'
}) {
  const pct = usagePct(spent, budget)
  const fillColor =
    status === 'blocked'
      ? 'var(--bad)'
      : status === 'warn'
        ? 'var(--warn-ink, #b45309)'
        : 'var(--accent)'

  return (
    <div className={`usage-meter usage-meter--${size}`}>
      <div
        className="usage-meter__track"
        role="progressbar"
        aria-valuenow={pct ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="usage-meter__fill"
          style={{
            width: pct != null ? `${Math.min(100, pct)}%` : spent > 0 ? '4%' : '0%',
            background: fillColor,
          }}
        />
      </div>
      {pct != null && <span className="usage-meter__pct mono muted">{pct}%</span>}
    </div>
  )
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="stats__cell">
      <div className="stats__lbl">{label}</div>
      <div className="stats__val">{value}</div>
    </div>
  )
}

function permissionBullets(role: string | null, isAdmin: boolean, canEdit: boolean): string[] {
  const bullets = ['View jobs, runs, and results']
  if (canEdit) bullets.push('Run screenings and manage candidates')
  if (isAdmin) bullets.push('Manage workspace settings and team')
  if (!role) return bullets
  return bullets
}

function ProfileUsageCard({ usage }: { usage: ProfileResponse['usage'] }) {
  if (!usage) return null

  const remaining = usage.remaining_usd ?? budgetRemaining(usage.spent_usd, usage.budget_usd)
  const hasCap = usage.budget_usd != null && usage.budget_usd > 0

  return (
    <div
      className={`card usage-budget profile-usage${usage.status === 'blocked' ? ' usage-budget--blocked' : ''}${usage.status === 'warn' ? ' usage-budget--warn' : ''}`}
    >
      <div className="card__head">
        <Icon name="sparkle" size={14} className="muted" />
        <span className="card__title">AI credits</span>
        <div className="spacer" />
        <Badge tone={statusTone(usage.status)} dot={false}>{statusLabel(usage.status)}</Badge>
      </div>
      <div className="card__body">
        <div className="usage-budget__main" style={{ marginBottom: hasCap ? 12 : 0 }}>
          <div>
            <div className="usage-budget__label mono">Spent</div>
            <div className="usage-budget__amount">
              <span className="usage-budget__spent">{formatUsd(usage.spent_usd)}</span>
              {hasCap && (
                <span className="muted usage-budget__of"> of {formatUsd(usage.budget_usd as number)} allocated</span>
              )}
            </div>
            {hasCap && remaining != null && (
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                {formatUsd(remaining)} remaining credits
              </div>
            )}
            {!hasCap && (
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                Pay as you go — no internal credit cap
              </div>
            )}
          </div>
        </div>
        {hasCap && (
          <UsageMeter spent={usage.spent_usd} budget={usage.budget_usd} status={usage.status} size="lg" />
        )}
        {usage.status === 'blocked' && (
          <p className="usage-budget__note usage-budget__note--bad">
            Credits exhausted. New screenings are blocked until an admin adds credits in Settings.
          </p>
        )}
        {usage.status === 'warn' && (
          <p className="usage-budget__note usage-budget__note--warn">
            You&apos;ve used {formatPct(usage.pct_used)} of your allocated credits — pace upcoming runs accordingly.
          </p>
        )}
      </div>
    </div>
  )
}

function ViewerAccessCard() {
  return (
    <div className="card profile-perms-card">
      <div className="card__head">
        <Icon name="eye" size={14} className="muted" />
        <span className="card__title">Access</span>
      </div>
      <div className="card__body">
        <p className="profile-perms-card__lead muted">
          View-only access. You can browse jobs, screening runs, and results but cannot start new screenings.
        </p>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const { user, displayName, avatarUrl, role, canEdit, isAdmin, signOut } = useAuth()
  const [profile, setProfile] = React.useState<ProfileResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  const load = React.useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    api.me
      .getProfile()
      .then((data) => {
        if (cancelled) return
        setProfile(data)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load profile')
        setProfile(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => load(), [load])

  if (loading) {
    return (
      <div className="page profile-page">
        <PageLoading title="Profile" message="Loading your profile…" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="page profile-page">
        <PageError message={error} onRetry={load} />
      </div>
    )
  }

  const stats = profile?.stats
  const bullets = permissionBullets(role, isAdmin, canEdit)

  return (
    <div className="page profile-page">
      <div className="stats stats--4 profile-stats">
        <StatCell label="Screenings" value={formatCount(stats?.screenings ?? 0)} />
        <StatCell label="CVs processed" value={formatCount(stats?.cvs_processed ?? 0)} />
        <StatCell label="Jobs screened" value={formatCount(stats?.jobs_screened ?? 0)} />
        <StatCell label="Activity (30d)" value={formatCount(stats?.activity_30d ?? 0)} />
      </div>

      <div className="profile-quick-links">
        <Link to="/activity" className="profile-quick-links__item">
          <Icon name="history" size={14} />
          Activity Log
        </Link>
        {canEdit && (
          <Link to="/usage" className="profile-quick-links__item">
            <Icon name="sparkle" size={14} />
            Usage
          </Link>
        )}
        {isAdmin && (
          <Link to="/settings" className="profile-quick-links__item">
            <Icon name="shield" size={14} />
            Settings
          </Link>
        )}
      </div>

      <div className="profile-main">
        <div className="card profile-identity">
          <div className="card__head">
            <span className="card__title">Profile</span>
          </div>
          <div className="card__body">
            <div className="profile-identity__header">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="profile-identity__avatar" />
              ) : (
                <div className="profile-identity__avatar profile-identity__avatar--fallback">
                  {(displayName ?? '?').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <div className="profile-identity__name">{displayName}</div>
                <div className="profile-identity__email muted">{user?.email}</div>
                {role && (
                  <div className="profile-identity__role">
                    <Badge tone="ghost" dot={false}>{labelForRole(role)}</Badge>
                  </div>
                )}
              </div>
            </div>

            <dl className="profile-meta-list">
              <div className="profile-meta-list__row">
                <dt>Workspace</dt>
                <dd>{profile?.workspace.name ?? '—'}</dd>
              </div>
              <div className="profile-meta-list__row">
                <dt>Member since</dt>
                <dd>{profile?.joined_at ? formatDate(profile.joined_at) : '—'}</dd>
              </div>
              <div className="profile-meta-list__row">
                <dt>Activity</dt>
                <dd>{profile?.last_seen_at ? formatRelativeActive(profile.last_seen_at) : '—'}</dd>
              </div>
              <div className="profile-meta-list__row">
                <dt>Sign-in</dt>
                <dd>Google account</dd>
              </div>
            </dl>

            <div className="profile-perms">
              <div className="profile-perms__label">Permissions</div>
              <ul className="profile-perms__list">
                {bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="profile-main__side">
          {canEdit && profile?.usage ? (
            <ProfileUsageCard usage={profile.usage} />
          ) : (
            <ViewerAccessCard />
          )}

          <div className="card profile-activity">
            <div className="card__head">
              <Icon name="history" size={14} className="muted" />
              <span className="card__title">Recent activity</span>
              <div className="spacer" />
              <Link to="/activity" className="linkish profile-activity__view-all">
                View all →
              </Link>
            </div>
            <div className="card__body profile-activity__body">
              <ActivityLogList
                entries={profile?.recent_activity ?? []}
                compact
                emptyMessage={canEdit
                  ? 'Your screening runs, criteria changes, candidate decisions, and Recruitee syncs are recorded here automatically.'
                  : 'Activity from shared runs and workspace events appears here when available.'}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="profile-footer">
        <p className="profile-footer__note muted">Profile details are managed by your Google account.</p>
        <button type="button" className="profile-footer__signout" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    </div>
  )
}
