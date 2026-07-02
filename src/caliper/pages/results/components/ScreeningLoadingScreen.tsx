// @ts-nocheck
import React from 'react'
import { Icon } from '@/caliper/ui'

export function ScreeningLoadingScreen({ jobName, queued = false }) {
  const title = queued ? 'Screening queued' : 'Screening in progress'
  const sub = queued
    ? 'Your run is queued and will begin scoring shortly. This page updates automatically — no need to refresh.'
    : `Scoring CVs against ${jobName ? `“${jobName}”` : 'this job'}’s criteria. Results appear automatically the moment they are ready.`

  return (
    <div className="screening-loading card" role="status" aria-live="polite">
      <div className="screening-loading__stage" aria-hidden="true">
        <span className="screening-loading__ring" />
        <span className="screening-loading__ring" />
        <span className="screening-loading__ring" />
        <span className="screening-loading__emblem">
          <Icon name="sparkle" size={26} />
        </span>
      </div>

      <div className="screening-loading__title">{title}</div>
      <p className="screening-loading__sub">{sub}</p>

      <div className="screening-loading__bar" aria-hidden="true">
        <span className="screening-loading__bar-fill" />
      </div>

      <div className="screening-loading__skeletons" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="screening-loading__skel-row"
            style={{ animationDelay: `${i * 140}ms` }}
          >
            <span className="screening-loading__skel-rank" />
            <span className="screening-loading__skel-avatar" />
            <span className="screening-loading__skel-lines">
              <span className="screening-loading__skel-line" />
              <span className="screening-loading__skel-line screening-loading__skel-line--short" />
            </span>
            <span className="screening-loading__skel-badge" />
          </div>
        ))}
      </div>

      <p className="screening-loading__hint mono">Larger runs can take a few minutes</p>
    </div>
  )
}
