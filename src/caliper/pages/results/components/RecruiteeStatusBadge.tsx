// @ts-nocheck
import React from 'react'
import { Badge } from '@/caliper/ui'

/** Reflects where a candidate actually sits in Recruitee right now (stage or disqualified). */
export function RecruiteeStatusBadge({ state, compact = false }) {
  if (!state) return null;
  if (state.disqualified) {
    return (
      <span
        className="disposition-badge-wrap"
        title={state.disqualifyReason ? `Disqualified in Recruitee — ${state.disqualifyReason}` : 'Disqualified in Recruitee'}
      >
        <Badge tone="bad" dot>Disqualified</Badge>
      </span>
    );
  }
  if (state.stageName) {
    const label = compact && state.stageName.length > 22 ? `${state.stageName.slice(0, 20)}…` : state.stageName;
    return (
      <span className="disposition-badge-wrap" title={`In Recruitee — ${state.stageName}`}>
        <Badge tone="default" dot>{label}</Badge>
      </span>
    );
  }
  return null;
}
