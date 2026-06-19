// @ts-nocheck
import React from 'react'
import { Badge, Icon } from '@/caliper/ui'
import { useCaliperGo } from '@/caliper/CaliperNavContext'
import { resolveActivityMeta, splitActivityTimestamp } from '@/lib/activity-display'

export function ActivityLogList({
  entries,
  emptyTitle = 'No activity yet',
  emptyMessage,
  compact = false,
}) {
  const go = useCaliperGo()

  if (!entries?.length) {
    return (
      <div className={`activity-feed-empty${compact ? ' activity-feed-empty--compact' : ''}`}>
        <div className="activity-feed-empty__icon" aria-hidden>
          <Icon name="history" size={compact ? 20 : 24} />
        </div>
        <div className="activity-feed-empty__title">{emptyTitle}</div>
        {emptyMessage && (
          <p className="activity-feed-empty__message">{emptyMessage}</p>
        )}
      </div>
    )
  }

  return (
    <div
      className={`activity-feed${compact ? ' activity-feed--compact' : ''}`}
      role="list"
      aria-label="Activity log"
    >
      {entries.map((entry, index) => {
        const { tone, actionLabel, icon } = resolveActivityMeta(entry)
        const { when, clock } = splitActivityTimestamp(entry.ts)
        const isLast = index === entries.length - 1

        return (
          <article
            key={entry.id}
            className={`activity-item activity-item--${tone}`}
            role="listitem"
          >
            <div className="activity-item__rail" aria-hidden>
              <span className="activity-item__dot">
                <Icon name={icon} size={compact ? 11 : 12} />
              </span>
              {!isLast && <span className="activity-item__line" />}
            </div>

            <div className="activity-item__body">
              <div className="activity-item__top">
                <span className={`activity-pill activity-pill--${tone}`}>
                  {actionLabel}
                </span>
                <time className="activity-item__time" dateTime={entry.ts}>
                  <span className="activity-item__when">{when}</span>
                  {clock && <span className="activity-item__clock">{clock}</span>}
                </time>
                {entry.jobName && entry.jobId && (
                  <button
                    type="button"
                    className="activity-chip"
                    onClick={() => go('profiles', { job: entry.jobId })}
                    title={`Open ${entry.jobName}`}
                  >
                    <Icon name="briefcase" size={11} />
                    <span className="activity-chip__text">{entry.jobName}</span>
                  </button>
                )}
              </div>

              <p className="activity-item__summary">
                <span className="activity-item__who">{entry.who}</span>
                <span className="activity-item__msg">{entry.msg}</span>
                {entry.warned && (
                  <Badge tone="warn" style={{ marginLeft: 8, verticalAlign: 'middle' }}>
                    Bias criteria
                  </Badge>
                )}
              </p>

              {entry.reason !== '—' && (
                <p className="activity-item__reason">
                  <Icon name="info" size={12} aria-hidden />
                  {entry.reason}
                </p>
              )}

              {entry.runId && (
                <button
                  type="button"
                  className="activity-item__link"
                  onClick={() => go('results', entry.runId)}
                >
                  View screening run
                  <Icon name="chevron-right" size={12} />
                </button>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}
