// @ts-nocheck
import React from 'react'
import { candidateMetrics } from '../results-utils'

export function ScoreDeductionBreakdown({ candidate }) {
  const { criteriaMetPct, scoreBase, penaltyFlag, cvQualityScore } = candidateMetrics(candidate);
  const pct = criteriaMetPct ?? scoreBase;
  if (pct == null) return null;
  const flagPen = penaltyFlag;
  const final = candidate.score ?? 0;

  if (cvQualityScore != null) {
    return (
      <span className="score-deduction mono" style={{ fontSize: 11 }}>
        Checklist <strong>{pct}%</strong>
        {' · '}CV quality <strong style={{ color: cvQualityScore < 55 ? 'var(--warn-ink)' : 'var(--ink)' }}>{cvQualityScore}/100</strong>
        {flagPen > 0 && <> · Flags −<strong style={{ color: 'var(--bad-ink)' }}>{flagPen}</strong></>}
        {' → '}<strong style={{ color: 'var(--ink)' }}>{final}</strong>
      </span>
    );
  }

  if (flagPen === 0) {
    return (
      <span className="mono muted" style={{ fontSize: 11 }}>
        Checklist {pct}% → <strong style={{ color: 'var(--ink)' }}>{final}</strong>
      </span>
    );
  }
  return (
    <span className="score-deduction mono" style={{ fontSize: 11 }}>
      Checklist <strong>{pct}%</strong>
      {flagPen > 0 && <> − Flags <strong style={{ color: 'var(--bad-ink)' }}>{flagPen}</strong></>}
      {' '}= <strong style={{ color: 'var(--ink)' }}>{final}</strong>
    </span>
  );
}
