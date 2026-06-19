// @ts-nocheck
import React from 'react'
import { Link } from 'react-router-dom'
import { Badge, Btn, Icon, Segmented } from '@/caliper/ui'
import { api } from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import { labelForRole } from '@/lib/roles'

const FEATURE_LABELS = {
  screening: 'Screening',
  criteria_gen: 'Criteria generation',
  embedding: 'CV embedding',
  cv_search: 'Talent search',
  discovery: 'Profile discovery',
  jd_alignment: 'Profile alignment',
};

function formatUsd(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function formatPct(pct) {
  if (pct == null) return '—';
  return `${pct}%`;
}

function statusTone(status) {
  if (status === 'blocked') return 'bad';
  if (status === 'warn') return 'warn';
  if (status === 'unlimited') return 'ghost';
  return 'ok';
}

function statusLabel(status) {
  if (status === 'blocked') return 'Over budget';
  if (status === 'warn') return 'Approaching limit';
  if (status === 'unlimited') return 'No cap';
  return 'Within budget';
}

function budgetRemaining(spent, budget) {
  if (budget == null || budget <= 0) return null;
  return Math.max(0, budget - spent);
}

function usagePct(spent, budget) {
  if (budget == null || budget <= 0) return null;
  return Math.min(100, Math.round((spent / budget) * 1000) / 10);
}

function formatMonthLabel(monthKey) {
  if (!monthKey || monthKey === 'all') return 'All time';
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatMonthShort(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: 'short',
    timeZone: 'UTC',
  });
}

function latestMonthWithData(monthly) {
  if (!monthly?.length) return null;
  for (let i = monthly.length - 1; i >= 0; i -= 1) {
    const bucket = monthly[i];
    if (bucket.spent_usd > 0 || bucket.event_count > 0) return bucket.month;
  }
  return null;
}

function sortedSplitEntries(record) {
  return Object.entries(record || {}).sort((a, b) => b[1] - a[1]);
}

function splitBarPct(value, total) {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function UsageMeter({ spent, budget, status, size = 'md' }) {
  const pct = usagePct(spent, budget);
  const fillColor = status === 'blocked'
    ? 'var(--bad)'
    : status === 'warn'
      ? 'var(--warn-ink, #b45309)'
      : 'var(--accent)';

  return (
    <div className={`usage-meter usage-meter--${size}`}>
      <div className="usage-meter__track" role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="usage-meter__fill"
          style={{
            width: pct != null ? `${Math.min(100, pct)}%` : spent > 0 ? '4%' : '0%',
            background: fillColor,
          }}
        />
      </div>
      {pct != null && (
        <span className="usage-meter__pct mono muted">{pct}%</span>
      )}
    </div>
  );
}

function StatCell({ label, value, sub }) {
  return (
    <div className="stats__cell">
      <div className="stats__lbl">{label}</div>
      <div className="stats__val">{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

function PersonalBudgetPanel({ usage }) {
  if (!usage) return null;
  const remaining = budgetRemaining(usage.spent_usd, usage.budget_usd);
  const hasCap = usage.budget_usd != null && usage.budget_usd > 0;
  const showPanel = hasCap || usage.status === 'blocked' || usage.status === 'warn';

  if (!showPanel && usage.spent_usd === 0) return null;

  return (
    <div className={`card usage-budget${usage.status === 'blocked' ? ' usage-budget--blocked' : ''}${usage.status === 'warn' ? ' usage-budget--warn' : ''}`}>
      <div className="usage-budget__main">
        <div>
          <div className="usage-budget__label mono">Your budget</div>
          <div className="usage-budget__amount">
            <span className="usage-budget__spent">{formatUsd(usage.spent_usd)}</span>
            {hasCap && (
              <span className="muted usage-budget__of"> of {formatUsd(usage.budget_usd)}</span>
            )}
          </div>
          {hasCap && remaining != null && (
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              {formatUsd(remaining)} remaining
            </div>
          )}
          {!hasCap && (
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>No spending cap configured</div>
          )}
        </div>
        <Badge tone={statusTone(usage.status)}>{statusLabel(usage.status)}</Badge>
      </div>
      {hasCap && <UsageMeter spent={usage.spent_usd} budget={usage.budget_usd} status={usage.status} size="lg" />}
      {usage.status === 'blocked' && (
        <p className="usage-budget__note usage-budget__note--bad">
          New screenings are blocked until an admin raises your cap in Settings.
        </p>
      )}
      {usage.status === 'warn' && (
        <p className="usage-budget__note usage-budget__note--warn">
          You&apos;ve used {formatPct(usage.pct_used)} of your budget — pace upcoming runs accordingly.
        </p>
      )}
    </div>
  );
}

function MonthTrend({ monthly, selectedMonth, onSelectMonth, metric, onMetricChange }) {
  const maxSpend = Math.max(...(monthly ?? []).map((b) => b.spent_usd), 0);
  const maxCvs = Math.max(...(monthly ?? []).map((b) => b.cv_count), 0);
  const maxValue = metric === 'spend' ? maxSpend : maxCvs;
  const hasAnyData = (monthly ?? []).some((b) => b.spent_usd > 0 || b.event_count > 0);

  return (
    <div className="card usage-section usage-trend">
      <div className="card__head">
        <div>
          <span className="card__title">Monthly trend</span>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            Click a month to inspect breakdown and activity
          </div>
        </div>
        <Segmented
          value={metric}
          onChange={onMetricChange}
          options={[
            { value: 'spend', label: 'Spend' },
            { value: 'cvs', label: 'CVs' },
          ]}
        />
      </div>
      <div className="card__body">
        {!hasAnyData ? (
          <div className="usage-empty usage-empty--compact">
            <p className="usage-empty__title">No monthly data yet</p>
            <p className="usage-empty__sub muted">Run a screening to populate the trend chart.</p>
          </div>
        ) : (
          <>
            <div className="usage-trend__all">
              <button
                type="button"
                className={`usage-trend__all-btn${selectedMonth === 'all' ? ' is-selected' : ''}`}
                onClick={() => onSelectMonth('all')}
              >
                All time
              </button>
            </div>
            <div className="usage-trend__bars" role="list">
              {(monthly ?? []).map((bucket) => {
                const value = metric === 'spend' ? bucket.spent_usd : bucket.cv_count;
                const heightPct = maxValue > 0 ? Math.max(value > 0 ? 6 : 0, (value / maxValue) * 100) : 0;
                const isSelected = selectedMonth === bucket.month;
                return (
                  <button
                    key={bucket.month}
                    type="button"
                    role="listitem"
                    className={`usage-trend__col${isSelected ? ' is-selected' : ''}`}
                    onClick={() => onSelectMonth(bucket.month)}
                    aria-pressed={isSelected}
                    aria-label={`${formatMonthLabel(bucket.month)}: ${metric === 'spend' ? formatUsd(bucket.spent_usd) : `${bucket.cv_count} CVs`}`}
                  >
                    <span className="usage-trend__value mono">
                      {metric === 'spend'
                        ? (bucket.spent_usd > 0 ? formatUsd(bucket.spent_usd) : '—')
                        : (bucket.cv_count > 0 ? String(bucket.cv_count) : '—')}
                    </span>
                    <span className="usage-trend__track">
                      <span
                        className="usage-trend__bar"
                        style={{ height: `${heightPct}%` }}
                      />
                    </span>
                    <span className="usage-trend__label">{formatMonthShort(bucket.month)}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function UsageSplitBars({ title, entries, total, labelForKey }) {
  if (!entries.length) {
    return (
      <div className="usage-split">
        <div className="usage-split__title">{title}</div>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>No spend recorded</p>
      </div>
    );
  }

  return (
    <div className="usage-split">
      <div className="usage-split__title">{title}</div>
      <div className="usage-split__list">
        {entries.map(([key, amount]) => (
          <div key={key} className="usage-split__row">
            <div className="usage-split__meta">
              <span>{labelForKey ? labelForKey(key) : key}</span>
              <span className="mono muted">{formatUsd(amount)}</span>
            </div>
            <div className="usage-split__track">
              <div
                className="usage-split__fill"
                style={{ width: `${splitBarPct(amount, total)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthBreakdown({ bucket, selectedMonth }) {
  if (!bucket || selectedMonth === 'all') return null;

  const featureEntries = sortedSplitEntries(bucket.by_feature);
  const modelEntries = sortedSplitEntries(bucket.by_model);
  const total = bucket.spent_usd;

  return (
    <div className="card usage-section usage-breakdown">
      <div className="card__head">
        <div>
          <span className="card__title">{formatMonthLabel(selectedMonth)}</span>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Breakdown for selected month</div>
        </div>
      </div>
      <div className="card__body">
        <div className="stats stats--3" style={{ marginBottom: 18 }}>
          <StatCell label="Spend" value={formatUsd(bucket.spent_usd)} />
          <StatCell label="CVs screened" value={String(bucket.cv_count)} />
          <StatCell label="Events" value={String(bucket.event_count)} />
        </div>
        <div className="usage-breakdown__grid">
          <UsageSplitBars
            title="By feature"
            entries={featureEntries}
            total={total}
            labelForKey={(key) => FEATURE_LABELS[key] ?? key}
          />
          <UsageSplitBars
            title="By model"
            entries={modelEntries}
            total={total}
          />
        </div>
      </div>
    </div>
  );
}

function TeamMonthlySection({ teamMonthly, selectedMonth, onSelectMonth }) {
  if (!teamMonthly?.members?.length) return null;

  const { months, team_by_month, members } = teamMonthly;
  const teamTotal = members.reduce((sum, m) => sum + m.total_usd, 0);

  return (
    <div className="card usage-section">
      <div className="card__head">
        <div>
          <span className="card__title">Team by month</span>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            Per-member spend across recent months
          </div>
        </div>
      </div>
      <div className="card__body" style={{ padding: 0 }}>
        <div className="usage-month-matrix-scroll">
          <table className="tbl usage-month-matrix">
            <thead>
              <tr>
                <th className="usage-month-matrix__member-col">Member</th>
                {months.map((month) => (
                  <th
                    key={month}
                    className={`usage-month-matrix__month-col col-right${selectedMonth === month ? ' is-selected' : ''}`}
                  >
                    <button
                      type="button"
                      className="usage-month-matrix__month-btn"
                      onClick={() => onSelectMonth(month)}
                    >
                      {formatMonthShort(month)}
                    </button>
                  </th>
                ))}
                <th className="usage-month-matrix__total-col col-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.user_id}>
                  <td className="usage-month-matrix__member-col">
                    <div className="usage-member">
                      <span className="usage-member__name">{member.name || member.email}</span>
                      {member.name && <span className="usage-member__email">{member.email}</span>}
                    </div>
                  </td>
                  {months.map((month) => {
                    const spent = member.by_month?.[month] ?? 0;
                    return (
                      <td
                        key={month}
                        className={`usage-month-matrix__month-col col-right mono${selectedMonth === month ? ' is-selected' : ''}`}
                      >
                        {spent > 0 ? formatUsd(spent) : <span className="muted">—</span>}
                      </td>
                    );
                  })}
                  <td className="usage-month-matrix__total-col col-right mono">
                    {member.total_usd > 0 ? formatUsd(member.total_usd) : <span className="muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="usage-month-matrix__foot">
                <td className="usage-month-matrix__member-col">
                  <span className="muted" style={{ fontSize: 12 }}>Team total</span>
                </td>
                {months.map((month) => {
                  const spent = team_by_month?.[month] ?? 0;
                  return (
                    <td
                      key={month}
                      className={`usage-month-matrix__month-col col-right mono${selectedMonth === month ? ' is-selected' : ''}`}
                    >
                      {spent > 0 ? formatUsd(spent) : <span className="muted">—</span>}
                    </td>
                  );
                })}
                <td className="usage-month-matrix__total-col col-right mono">
                  {teamTotal > 0 ? formatUsd(teamTotal) : <span className="muted">—</span>}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function TeamUsageSection({ members, totals }) {
  if (!members?.length) return null;

  return (
    <div className="card usage-section">
      <div className="card__head">
        <div>
          <span className="card__title">Team</span>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            Lifetime caps per member
          </div>
        </div>
        <Link to="/settings">
          <Btn size="sm" variant="ghost">Manage budgets</Btn>
        </Link>
      </div>
      <div className="card__body" style={{ padding: 0 }}>
        <table className="tbl usage-team-tbl">
          <thead>
            <tr>
              <th>Member</th>
              <th style={{ width: 88 }}>Role</th>
              <th style={{ width: 96 }} className="col-right">Budget</th>
              <th style={{ width: 96 }} className="col-right">Spent</th>
              <th style={{ width: 140 }}>Used</th>
              <th style={{ width: 108 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const hasCap = m.budget_usd != null && m.budget_usd > 0;
              return (
                <tr key={m.user_id}>
                  <td>
                    <div className="usage-member">
                      <span className="usage-member__name">{m.name || m.email}</span>
                      {m.name && <span className="usage-member__email">{m.email}</span>}
                    </div>
                  </td>
                  <td><Badge tone="ghost">{labelForRole(m.role)}</Badge></td>
                  <td className="col-right mono">{hasCap ? formatUsd(m.budget_usd) : 'Unlimited'}</td>
                  <td className="col-right mono">{formatUsd(m.spent_usd)}</td>
                  <td>
                    {hasCap ? (
                      <div className="usage-team-bar">
                        <UsageMeter spent={m.spent_usd} budget={m.budget_usd} status={m.status} size="sm" />
                      </div>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>—</span>
                    )}
                  </td>
                  <td>
                    {m.status === 'ok' || m.status === 'unlimited' ? (
                      <span className="muted" style={{ fontSize: 12 }}>{statusLabel(m.status)}</span>
                    ) : (
                      <Badge tone={statusTone(m.status)}>{statusLabel(m.status)}</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {totals && (
          <div className="usage-team-foot">
            <span><span className="muted">Allocated</span> <span className="mono">{formatUsd(totals.budget_usd)}</span></span>
            <span><span className="muted">Team spent</span> <span className="mono">{formatUsd(totals.spent_usd)}</span></span>
          </div>
        )}
      </div>
    </div>
  );
}

function RecentActivitySection({ selectedMonth, fallbackEvents }) {
  const [events, setEvents] = React.useState(fallbackEvents ?? []);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (selectedMonth === 'all') {
      setEvents(fallbackEvents ?? []);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    api.usage.events({ month: selectedMonth, limit: 100 })
      .then(({ events: monthEvents }) => {
        if (!cancelled) setEvents(monthEvents ?? []);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedMonth, fallbackEvents]);

  const title = selectedMonth === 'all'
    ? 'Recent activity'
    : `${formatMonthLabel(selectedMonth)} activity`;

  return (
    <div className="card usage-section">
      <div className="card__head">
        <div>
          <span className="card__title">{title}</span>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {selectedMonth === 'all'
              ? 'Last AI calls in this workspace'
              : 'All logged calls in the selected month'}
          </div>
        </div>
        <span className="mono muted" style={{ fontSize: 11 }}>
          {loading ? 'Loading…' : `${events.length} event${events.length === 1 ? '' : 's'}`}
        </span>
      </div>
      <div className="card__body" style={{ padding: 0 }}>
        {events.length === 0 ? (
          <div className="usage-empty">
            <Icon name="sparkle" size={22} className="muted"/>
            <p className="usage-empty__title">No usage recorded yet</p>
            <p className="usage-empty__sub muted">
              Run a screening from Jobs to start tracking spend per CV.
            </p>
            <Link to="/jobs">
              <Btn variant="primary" size="sm" icon="briefcase">Open Jobs</Btn>
            </Link>
          </div>
        ) : (
          <table className="tbl usage-events-tbl">
            <thead>
              <tr>
                <th style={{ width: 120 }}>When</th>
                <th>Feature</th>
                <th style={{ width: 140 }}>Model</th>
                <th style={{ width: 88 }} className="col-right">Cost</th>
                <th style={{ width: 120 }}>Run</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td className="mono muted usage-events-tbl__when">
                    {new Date(ev.created_at).toLocaleString(undefined, {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td>{FEATURE_LABELS[ev.feature] ?? ev.feature}</td>
                  <td className="mono muted usage-events-tbl__model">{ev.model}</td>
                  <td className="col-right mono">{formatUsd(ev.cost_usd)}</td>
                  <td>
                    {ev.run_id ? (
                      <Link to={`/runs/${ev.run_id}`} className="mono usage-events-tbl__run">
                        {ev.run_id}
                      </Link>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function UsagePage() {
  const { isAdmin, canEdit } = useAuth();
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [selectedMonth, setSelectedMonth] = React.useState('all');
  const [trendMetric, setTrendMetric] = React.useState('spend');
  const didInitMonth = React.useRef(false);

  React.useEffect(() => {
    if (!canEdit) return;
    setLoading(true);
    setError(null);
    api.usage.get()
      .then(setData)
      .catch((e) => setError(e?.message ?? 'Failed to load usage.'))
      .finally(() => setLoading(false));
  }, [canEdit]);

  React.useEffect(() => {
    if (!data?.monthly || didInitMonth.current) return;
    const latest = latestMonthWithData(data.monthly);
    if (latest) {
      setSelectedMonth(latest);
      didInitMonth.current = true;
    }
  }, [data?.monthly]);

  const monthly = data?.monthly ?? [];
  const selectedBucket = selectedMonth === 'all'
    ? null
    : monthly.find((b) => b.month === selectedMonth) ?? null;

  if (!canEdit) {
    return (
      <div className="page usage-page">
        <div className="usage-empty usage-empty--compact">
          <p className="usage-empty__title">Usage tracking unavailable</p>
          <p className="usage-empty__sub muted">Your role cannot view AI spend for this workspace.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page usage-page">
        <div className="muted" style={{ padding: '48px 0', textAlign: 'center', fontSize: 13 }}>Loading usage…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page usage-page">
        <div className="callout" style={{ color: 'var(--bad-ink)', marginTop: 8 }}>{error}</div>
      </div>
    );
  }

  const self = data?.self;
  const events = data?.recent_events ?? [];
  const remaining = self ? budgetRemaining(self.spent_usd, self.budget_usd) : null;
  const hasCap = self?.budget_usd != null && self.budget_usd > 0;

  return (
    <div className="page usage-page">
      <p className="usage-page__intro muted">
        Per-member AI spend with a month-by-month breakdown. Budget caps are lifetime until an admin changes them in Settings.
      </p>

      <div className={`stats${isAdmin ? ' stats--4' : ''}`} style={{ marginBottom: 20 }}>
        <StatCell
          label="Your spend"
          value={formatUsd(self?.spent_usd ?? 0)}
          sub={self?.spent_usd === 0 ? 'No screenings logged yet' : undefined}
        />
        <StatCell
          label="Your budget"
          value={hasCap ? formatUsd(self.budget_usd) : 'Unlimited'}
          sub={hasCap && remaining != null ? `${formatUsd(remaining)} left` : undefined}
        />
        <StatCell
          label="Budget used"
          value={hasCap ? formatPct(self.pct_used) : '—'}
          sub={hasCap ? statusLabel(self.status) : 'No cap set'}
        />
        {isAdmin ? (
          <StatCell
            label="Team spent"
            value={formatUsd(data?.totals?.spent_usd ?? 0)}
            sub={data?.totals?.budget_usd ? `${formatUsd(data.totals.budget_usd)} allocated` : undefined}
          />
        ) : (
          <StatCell
            label="Recent events"
            value={String(events.length)}
            sub={events.length === 1 ? 'logged call' : 'logged calls'}
          />
        )}
      </div>

      <PersonalBudgetPanel usage={self} />

      <MonthTrend
        monthly={monthly}
        selectedMonth={selectedMonth}
        onSelectMonth={setSelectedMonth}
        metric={trendMetric}
        onMetricChange={setTrendMetric}
      />

      <MonthBreakdown bucket={selectedBucket} selectedMonth={selectedMonth} />

      <div className="usage-layout">
        {isAdmin && data?.members?.length > 0 && (
          <TeamUsageSection members={data.members} totals={data.totals} />
        )}
        {isAdmin && data?.team_monthly && (
          <TeamMonthlySection
            teamMonthly={data.team_monthly}
            selectedMonth={selectedMonth}
            onSelectMonth={setSelectedMonth}
          />
        )}
        <RecentActivitySection
          selectedMonth={selectedMonth}
          fallbackEvents={events}
        />
      </div>

      <div className="usage-guide">
        <span className="usage-guide__label mono">Cost guide</span>
        <p className="usage-guide__text muted">
          Screening typically costs about <strong>$0.02–0.03 per CV</strong> on Claude Sonnet, depending on CV length and criteria count.
          Criteria generation is usually under <strong>$0.20 per job</strong>.
        </p>
      </div>
    </div>
  );
}

export default UsagePage;
