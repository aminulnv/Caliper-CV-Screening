/** Resolve run timestamps from API (camelCase) or legacy snake_case. */

type RunTimestamps = {
  id: string;
  createdAt?: string | null;
  created_at?: string | null;
  startedAt?: string | null;
  started_at?: string | null;
  completedAt?: string | null;
  completed_at?: string | null;
};

/** Run ids are prefixed with DDMMYYYY (see backend run creation). */
export function runCreatedAt(run: RunTimestamps): Date | null {
  const raw = run.createdAt ?? run.created_at;
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const match = /^(\d{2})(\d{2})(\d{4})/.exec(run.id);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = Number(match[3]);
    const d = new Date(year, month, day);
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

export function formatRunDate(run: RunTimestamps): string {
  const d = runCreatedAt(run);
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatRunDuration(run: RunTimestamps): string {
  const started = run.startedAt ?? run.started_at;
  const completed = run.completedAt ?? run.completed_at;
  if (!started || !completed) return '—';
  const ms = new Date(completed).getTime() - new Date(started).getTime();
  if (Number.isNaN(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function runCvCount(run: { cvCount?: number; cv_count?: number }): number {
  return run.cvCount ?? run.cv_count ?? 0;
}

export function runScoreRange(
  run: { scoreRange?: number[] | null; score_range?: number[] | null },
): number[] | null {
  const range = run.scoreRange ?? run.score_range;
  return range?.length === 2 ? range : null;
}
