// @ts-nocheck
import { Badge, Btn, Icon } from '@/caliper/ui'
import { formatJobDate } from '@/lib/job-profile'

export interface RerunConflict {
  rowIndex: number;
  applicantId: string;
  name: string;
  run_id: string;
  run_status: string;
  run_created_at: string;
  score: number | null;
  priorRunCount: number;
}

function runStatusLabel(status: string, score: number | null): string {
  if (status === 'completed' && score != null) return String(score);
  if (status === 'in_progress') return 'In progress';
  if (status === 'queued') return 'Queued';
  return status;
}

export function RerunConflictAlert({
  conflicts,
  onRemove,
  onRemoveAll,
  prominent = false,
}: {
  conflicts: RerunConflict[];
  onRemove: (rowIndex: number) => void;
  onRemoveAll: () => void;
  prominent?: boolean;
}) {
  if (!conflicts.length) return null;

  return (
    <div className={`rerun-conflict${prominent ? ' rerun-conflict--prominent' : ''}`} role="alert">
      <div className="rerun-conflict__head">
        <Icon name="alert" size={16} className="rerun-conflict__icon"/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="rerun-conflict__title">
            Already screened
            <span style={{ marginLeft: 8 }}>
              <Badge tone="warn" dot>{conflicts.length}</Badge>
            </span>
          </div>
          <p className="rerun-conflict__help">
            These applicants were scored in a prior run on this job. Remove them to avoid duplicate screening cost, or continue if you want a fresh score.
          </p>
        </div>
      </div>

      <div className="rerun-conflict__list">
        {conflicts.map((c) => (
          <div key={`${c.rowIndex}-${c.run_id}`} className="rerun-conflict__row">
            <div className="rerun-conflict__candidate">
              <span style={{ fontWeight: 500, fontSize: 13 }}>{c.name}</span>
              {c.priorRunCount > 1 && (
                <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>
                  · {c.priorRunCount} prior runs
                </span>
              )}
            </div>
            <span className="mono rerun-conflict__run">{c.run_id}</span>
            <span className="mono muted" style={{ fontSize: 11.5 }}>
              {formatJobDate(c.run_created_at) ?? '—'}
            </span>
            <span className="rerun-conflict__score muted" style={{ fontSize: 11.5 }}>
              {runStatusLabel(c.run_status, c.score)}
            </span>
            <Btn
              size="sm"
              variant="ghost"
              onClick={() => onRemove(c.rowIndex)}
              aria-label={`Remove ${c.name} from selection`}
            >
              Remove
            </Btn>
          </div>
        ))}
      </div>

      {conflicts.length > 1 && (
        <div className="rerun-conflict__foot">
          <Btn size="sm" variant="ghost" onClick={onRemoveAll}>
            Remove all screened
          </Btn>
        </div>
      )}
    </div>
  );
}

export function formatPriorScreeningMeta(
  prior: { run_id: string | null; run_created_at: string } | null | undefined,
): string | null {
  if (!prior?.run_id) return null;
  const date = formatJobDate(prior.run_created_at);
  return date ? `Screened · ${prior.run_id} · ${date}` : `Screened · ${prior.run_id}`;
}
