// @ts-nocheck
import React from 'react'
import { Icon } from '@/caliper/ui'
import {
  countsFromEvaluations,
  countsFromCandidateRow,
  isBinaryMet,
} from '@/lib/criteria-checklist'

export function ChecklistPctBar({ pct, tone = 'ok', label }) {
  if (pct == null) return null;
  const width = Math.max(0, Math.min(100, pct));
  const bg =
    tone === 'bad' ? 'var(--bad)' : tone === 'warn' ? 'var(--warn)' : 'var(--ok)';
  return (
    <div className="checklist-pct">
      {label && (
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
          <span className="muted" style={{ fontSize: 11.5 }}>{label}</span>
          <span className="mono" style={{ fontSize: 11.5, fontWeight: 500 }}>{pct}%</span>
        </div>
      )}
      <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-sunk)', overflow: 'hidden' }}>
        <div style={{ width: `${width}%`, height: '100%', background: bg, borderRadius: 3 }}/>
      </div>
    </div>
  );
}

export function ChecklistSummary({ counts }) {
  if (!counts || counts.criteriaTotal === 0) return null;
  return (
    <div className="checklist-summary" style={{ display: 'grid', gap: 10 }}>
      <ChecklistPctBar
        label={`Criteria met (${counts.criteriaMet}/${counts.criteriaTotal})`}
        pct={counts.criteriaMetPct}
      />
      {counts.mustTotal > 0 && (
        <ChecklistPctBar
          label={`Must-haves (${counts.mustMet}/${counts.mustTotal})`}
          pct={counts.mustPct}
          tone={counts.mustPct === 100 ? 'ok' : 'warn'}
        />
      )}
      {counts.niceTotal > 0 && (
        <ChecklistPctBar
          label={`Nice-to-haves (${counts.niceMet}/${counts.niceTotal})`}
          pct={counts.nicePct}
        />
      )}
      {counts.flagTotal > 0 && (
        <ChecklistPctBar
          label={`Red flags triggered (${counts.flagTriggered}/${counts.flagTotal})`}
          pct={counts.flagPct}
          tone="bad"
        />
      )}
    </div>
  );
}

export function ChecklistRow({
  name, met, kind, weight, quote, inferred,
  decision, onAgree, onOverride, overriddenBy, overrideNote,
  onQuoteHover, isQuoteActive,
}) {
  const isFlag = kind === 'flag';
  const binaryMet = isBinaryMet(met);
  const label = isFlag
    ? (binaryMet ? 'Triggered' : 'Clear')
    : (binaryMet ? 'Met' : 'Not met');

  const linkHandlers = quote && onQuoteHover
    ? {
        onMouseEnter: () => onQuoteHover({ quote, kind, label: name }),
        onMouseLeave: () => onQuoteHover(null),
      }
    : {};

  return (
    <div
      className={`checklist-row checklist-row--${kind}${binaryMet ? ' is-met' : ''}${isFlag && binaryMet ? ' is-flag-hit' : ''}${isQuoteActive ? ' is-cv-linked' : ''}${quote ? ' is-cv-linkable' : ''}`}
      {...linkHandlers}
    >
      <span
        className="checklist-row__mark"
        aria-label={label}
        style={{
          background: binaryMet
            ? (isFlag ? 'var(--bad-soft)' : 'var(--ok-soft)')
            : 'var(--bg-sunk)',
          color: binaryMet ? (isFlag ? 'var(--bad-ink)' : 'var(--ok-ink)') : 'var(--muted)',
        }}
      >
        {binaryMet
          ? (isFlag ? <Icon name="alert" size={11} stroke={2.4}/> : <Icon name="check" size={12} stroke={2.6}/>)
          : <Icon name="x" size={10} stroke={2.2}/>}
      </span>
      <div className="checklist-row__body">
        <div className="checklist-row__line">
          <span className="checklist-row__name">{name}</span>
          {weight != null && <span className="mono muted" style={{ fontSize: 10.5 }}>×{weight}</span>}
          <span
            className={`checklist-row__status${binaryMet ? (isFlag ? ' checklist-row__status--bad' : ' checklist-row__status--ok') : ''}`}
          >
            {label}
          </span>
        </div>
        {quote ? (
          <div className="checklist-row__quote">
            <span>&ldquo;{quote}&rdquo;</span>
            <span className="cv-quotes__link-hint" style={{ display: 'block', marginTop: 4 }}>View in CV →</span>
          </div>
        ) : binaryMet && !isFlag ? (
          <div className="checklist-row__quote checklist-row__quote--empty muted">No direct quote — see CV panel.</div>
        ) : null}
        {inferred && binaryMet && !isFlag && (
          <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>Inferred from CV context</div>
        )}
        {overrideNote && (
          <div style={{ fontSize: 12, color: 'var(--warn-ink)', marginTop: 4 }}>Override: {overrideNote}</div>
        )}
        {(onAgree || onOverride) && (
          <div className="crit__actions" style={{ marginTop: 8 }}>
            {onAgree && (
              <button type="button" className={`checklist-decision${decision === 'agree' ? ' is-on' : ''}`} onClick={onAgree}>
                Agree
              </button>
            )}
            {onOverride && (
              <button type="button" className={`checklist-decision checklist-decision--warn${decision === 'override' ? ' is-on' : ''}`} onClick={onOverride}>
                {overriddenBy ? 'Re-override' : 'Override'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CriteriaChecklistPanel({
  evaluations, candidate, sections, decisions, onAgree, onOverride, onQuoteHover, activeQuote,
  readOnly = false,
}) {
  const counts = React.useMemo(() => {
    if (evaluations?.length) return countsFromEvaluations(evaluations);
    return countsFromCandidateRow(candidate ?? {});
  }, [evaluations, candidate]);

  return (
    <div className="checklist-panel">
      <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
        Scoring checklist
      </div>
      <ChecklistSummary counts={counts}/>
      <div style={{ marginTop: 14 }}>
        {sections.map((sec) => (
          <div key={sec.kind} style={{ marginBottom: 16 }}>
            <div className="eval-sec">
              <span>{sec.label}</span>
              <span className="eval-sec__line"/>
              <span className="mono">
                {sec.items.filter((i) => isBinaryMet(i.met)).length}/{sec.items.length} met
              </span>
            </div>
            {sec.items.map((it) => (
              <ChecklistRow
                key={it.id}
                name={it.job_criteria?.name ?? '—'}
                met={it.met}
                kind={sec.kind}
                weight={it.job_criteria?.weight}
                quote={it.quote}
                inferred={it.inferred}
                decision={decisions?.[it.id]}
                onAgree={!readOnly && onAgree ? () => onAgree(it.id) : undefined}
                onOverride={!readOnly && onOverride ? () => onOverride(it.id, it.met) : undefined}
                overriddenBy={it.overridden_by}
                overrideNote={it.override_note}
                onQuoteHover={onQuoteHover}
                isQuoteActive={Boolean(activeQuote && it.quote && it.quote === activeQuote)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
