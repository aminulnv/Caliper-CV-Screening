// @ts-nocheck
import { Icon, Confidence } from '@/caliper/ui'
import { isBinaryMet } from '@/lib/criteria-checklist'
import { truncateQuote } from '@/lib/compare-candidates'

export function CompareCell({ cell, kind }) {
  if (!cell) {
    return (
      <td className="compare-cell compare-cell--empty">
        <span className="muted" style={{ fontSize: 12 }}>—</span>
      </td>
    );
  }

  const isFlag = kind === 'flag';
  const binaryMet = isBinaryMet(cell.met);
  const label = isFlag
    ? (binaryMet ? 'Triggered' : 'Clear')
    : (binaryMet ? 'Met' : 'Not met');
  const quote = truncateQuote(cell.quote);

  return (
    <td className={`compare-cell${binaryMet && isFlag ? ' compare-cell--flag-hit' : ''}`}>
      <div className="compare-cell__top">
        <span
          className="compare-cell__mark"
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
        <span className={`compare-cell__status${binaryMet ? (isFlag ? ' compare-cell__status--bad' : ' compare-cell__status--ok') : ''}`}>
          {label}
        </span>
        {cell.confidence && <Confidence level={cell.confidence}/>}
      </div>
      {quote && (
        <div className="compare-cell__quote">&ldquo;{quote}&rdquo;</div>
      )}
      {cell.inferred && binaryMet && !isFlag && (
        <div className="compare-cell__meta muted">Inferred</div>
      )}
      {cell.overridden_by && (
        <div className="compare-cell__meta compare-cell__meta--warn">Overridden</div>
      )}
      {!cell.overridden_by && cell.agreed_by && (
        <div className="compare-cell__meta compare-cell__meta--ok">Agreed</div>
      )}
    </td>
  );
}
