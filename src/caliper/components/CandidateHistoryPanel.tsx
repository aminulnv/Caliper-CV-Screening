// @ts-nocheck
import React from 'react'
import { StatusBadge } from '@/caliper/ui'
import { api } from '@/services/api'
import type { CandidateHistoryItem } from '@/services/api'

function formatScreenedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function HistoryRow({ item, onNavigate }: { item: CandidateHistoryItem; onNavigate?: (runId: string) => void }) {
  const scoreLabel = item.score != null ? String(item.score) : '—';
  const handleClick = () => onNavigate?.(item.run_id);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onNavigate?.(item.run_id);
    }
  };

  return (
    <button
      type="button"
      className="candidate-history__row"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <span className="candidate-history__meta">
        <span className="mono">{formatScreenedAt(item.screened_at)}</span>
        <span className="candidate-history__sep">·</span>
        <span className="candidate-history__job">{item.job_name}</span>
        <span className="candidate-history__sep">—</span>
        <span className="mono">{scoreLabel}</span>
      </span>
      {item.status && <StatusBadge s={item.status}/>}
    </button>
  );
}

export function CandidateHistoryPanel({
  candidateId,
  onNavigate,
}: {
  candidateId: string;
  onNavigate?: (runId: string) => void;
}) {
  const [history, setHistory] = React.useState<CandidateHistoryItem[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    setHistory(null);
    api.candidates.getHistory(candidateId)
      .then((data) => setHistory(data.history ?? []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [candidateId]);

  if (loading) {
    return (
      <div className="candidate-history candidate-history--loading">
        <span className="muted" style={{ fontSize: 11.5 }}>Checking prior screenings…</span>
      </div>
    );
  }

  if (!history?.length) return null;

  return (
    <div className="candidate-history">
      <div className="candidate-history__label mono">Prior screenings</div>
      <div className="candidate-history__list">
        {history.map((item) => (
          <HistoryRow key={item.candidate_id} item={item} onNavigate={onNavigate}/>
        ))}
      </div>
    </div>
  );
}
