// @ts-nocheck
import React from 'react'
import { Icon } from '@/caliper/ui'
import { isBinaryMet } from '@/lib/criteria-checklist'

const KIND_LABEL = { must: 'Must-have', nice: 'Nice-to-have', flag: 'Red flag' };

export function CvQuotesPanel({ evaluations, onQuoteHover, activeQuote }) {
  const items = React.useMemo(() => {
    const list = evaluations ?? [];
    return list
      .filter((e) => e.quote?.trim())
      .map((e) => ({
        id: e.id,
        name: e.job_criteria?.name ?? 'Criterion',
        kind: e.job_criteria?.kind ?? 'must',
        quote: e.quote.trim(),
        met: e.met,
        inferred: e.inferred,
      }));
  }, [evaluations]);

  if (items.length === 0) return null;

  return (
    <div className="cv-quotes">
      <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
        Evidence from CV
      </div>
      <p className="muted" style={{ fontSize: 11.5, margin: '0 0 10px', lineHeight: 1.45 }}>
        Hover a card to locate the exact passage in the CV (left).
      </p>
      <div className="cv-quotes__list">
        {items.map((it) => (
          <blockquote
            key={it.id}
            className={`cv-quotes__item cv-quotes__item--${it.kind}${activeQuote === it.quote ? ' is-cv-linked' : ''}`}
            onMouseEnter={() => onQuoteHover?.({ quote: it.quote, kind: it.kind, label: it.name })}
            onMouseLeave={() => onQuoteHover?.(null)}
          >
            <div className="cv-quotes__meta">
              <span className="cv-quotes__criterion">{it.name}</span>
              <span className="mono muted" style={{ fontSize: 10.5 }}>{KIND_LABEL[it.kind] ?? it.kind}</span>
              <span className="cv-quotes__link-hint">View in CV →</span>
              {isBinaryMet(it.met) && it.kind !== 'flag' && (
                <span className="cv-quotes__badge cv-quotes__badge--ok">Met</span>
              )}
              {isBinaryMet(it.met) && it.kind === 'flag' && (
                <span className="cv-quotes__badge cv-quotes__badge--bad">Triggered</span>
              )}
              {it.inferred && (
                <span className="cv-quotes__badge cv-quotes__badge--warn">
                  <Icon name="info" size={10} /> Inferred
                </span>
              )}
            </div>
            <p className="cv-quotes__text">&ldquo;{it.quote}&rdquo;</p>
          </blockquote>
        ))}
      </div>
    </div>
  );
}
