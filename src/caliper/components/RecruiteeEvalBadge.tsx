import { Icon } from '@/caliper/ui';

export type EvalBadgeTone = 'ok' | 'warn' | 'bad';

export function evalScoreTone(score: number): EvalBadgeTone {
  if (score >= 76) return 'ok';
  if (score >= 51) return 'warn';
  return 'bad';
}

export function RecruiteeEvalBadge({
  score,
  inline = false,
}: {
  score: number | null | undefined;
  inline?: boolean;
}) {
  if (score == null || !Number.isFinite(score)) {
    if (inline) return <span className="muted">—</span>;
    return null;
  }

  const rounded = Math.round(score);
  const tone = evalScoreTone(rounded);
  const icon = tone === 'bad' ? 'thumb-down' : 'thumb-up';

  return (
    <span
      className={`cand-card__eval cand-card__eval--${tone}${inline ? ' cand-card__eval--inline' : ''}`}
      aria-label={`Recruitee evaluation: ${rounded} percent`}
    >
      <Icon name={icon} size={11} />
      <span className="cand-card__eval-pct">{rounded}%</span>
    </span>
  );
}
