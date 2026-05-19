type AuditPayload = Record<string, unknown> | null;

type AuditRow = {
  action: string;
  payload: AuditPayload | string;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  createdAt?: Date;
  created_at?: Date;
};

export type AuditEntryKind = 'job' | 'criteria' | 'run' | 'override' | 'sync' | 'other';

export type FormattedAuditEntry = {
  id: string;
  ts: string;
  who: string;
  msg: string;
  reason: string;
  warned: boolean;
  kind: AuditEntryKind;
  runId: string | null;
};

function parsePayload(payload: AuditPayload | string): AuditPayload {
  if (payload == null) return null;
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return payload;
}

function formatTimestamp(value: Date | undefined): string {
  if (!value) return '—';
  return value
    .toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    .replace(',', '  ');
}

function displayName(row: AuditRow, viewerUserId: string): string {
  if (!row.userId) return 'System';
  if (row.userId === viewerUserId) return 'You';
  return (row.userName || row.userEmail || 'Someone') as string;
}

function criteriaSummary(p: AuditPayload): string {
  const parts: string[] = [];
  const total = p?.criteria_count;
  if (typeof total === 'number') {
    parts.push(`${total} criterion${total === 1 ? '' : 'ia'}`);
  }
  const must = p?.must_count;
  const nice = p?.nice_count;
  const flags = p?.flag_count;
  if (typeof must === 'number' || typeof nice === 'number' || typeof flags === 'number') {
    const breakdown: string[] = [];
    if (must) breakdown.push(`${must} must`);
    if (nice) breakdown.push(`${nice} nice`);
    if (flags) breakdown.push(`${flags} flag`);
    if (breakdown.length) parts.push(breakdown.join(', '));
  }
  return parts.join(' · ');
}

function modelLabel(modelId: unknown): string {
  if (typeof modelId !== 'string' || !modelId) return 'default model';
  const labels: Record<string, string> = {
    'claude-sonnet-4-6': 'Claude Sonnet 4.6',
    'claude-opus-4-7': 'Claude Opus 4.7',
    'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
    'gpt-4o': 'GPT-4o',
    'gpt-4o-mini': 'GPT-4o Mini',
    'o3-mini': 'o3-mini',
  };
  return labels[modelId] ?? modelId;
}

function messageForAction(
  action: string,
  payload: AuditPayload,
): { msg: string; reason: string; warned: boolean; kind: AuditEntryKind; runId: string | null } {
  const p = payload ?? {};
  const runId = typeof p.run_id === 'string' ? p.run_id : null;

  switch (action) {
    case 'job.imported':
      return {
        kind: 'sync',
        runId: null,
        msg: `Job imported from Recruitee · “${p.name ?? 'Untitled'}”`,
        reason: '—',
        warned: false,
      };
    case 'job.refreshed_recruitee':
      return {
        kind: 'sync',
        runId: null,
        msg: `Refreshed job details from Recruitee${typeof p.applicants_count === 'number' ? ` · ${p.applicants_count} applicants` : ''}`,
        reason: '—',
        warned: false,
      };
    case 'job.upserted': {
      const biased = typeof p.biased_count === 'number' ? p.biased_count : 0;
      const criteriaPart = criteriaSummary(p);
      const modelPart = p.screening_model ? `screening model ${modelLabel(p.screening_model)}` : null;
      const pieces = ['Updated job setup'];
      if (criteriaPart) pieces.push(criteriaPart);
      if (modelPart) pieces.push(modelPart);
      return {
        kind: p.criteria_count != null ? 'criteria' : 'job',
        runId: null,
        msg: pieces.join(' · '),
        reason: '—',
        warned: biased > 0,
      };
    }
    case 'run.created':
      return {
        kind: 'run',
        runId: typeof p.run_id === 'string' ? p.run_id : null,
        msg: `Started screening · ${p.cv_count ?? '?'} CV${p.cv_count === 1 ? '' : 's'} · ${modelLabel(p.model_id)}`,
        reason: '—',
        warned: false,
      };
    case 'run.completed': {
      const range = Array.isArray(p.score_range) ? p.score_range : null;
      const rangeText =
        range && range.length === 2
          ? ` · scores ${range[0]}–${range[1]}`
          : '';
      return {
        kind: 'run',
        runId,
        msg: `Completed screening · ${p.cv_count ?? '?'} CV${p.cv_count === 1 ? '' : 's'} scored${rangeText}`,
        reason: '—',
        warned: false,
      };
    }
    case 'run.failed':
      return {
        kind: 'run',
        runId,
        msg: 'Screening run failed',
        reason: typeof p.error === 'string' && p.error.trim() ? p.error.trim().slice(0, 200) : '—',
        warned: false,
      };
    case 'evaluation.override': {
      const candidate = typeof p.candidate_name === 'string' ? p.candidate_name : 'a candidate';
      const criterion = typeof p.criterion_name === 'string' ? p.criterion_name : 'a criterion';
      const verdict =
        p.met === true ? 'marked as met' : p.met === false ? 'marked as not met' : 'updated';
      return {
        kind: 'override',
        runId,
        msg: `Overrode “${criterion}” for ${candidate} (${verdict})`,
        reason:
          typeof p.override_note === 'string' && p.override_note.trim()
            ? p.override_note.trim()
            : '—',
        warned: false,
      };
    }
    case 'settings.updated':
      return {
        kind: 'other',
        runId: null,
        msg: 'Updated workspace settings',
        reason: '—',
        warned: false,
      };
    default:
      return {
        kind: 'other',
        runId,
        msg: action.replace(/\./g, ' '),
        reason: '—',
        warned: false,
      };
  }
}

export function formatAuditEntry(
  row: AuditRow & { id: string },
  viewerUserId: string,
): FormattedAuditEntry {
  const payload = parsePayload(row.payload);
  const { msg, reason, warned, kind, runId } = messageForAction(row.action, payload);
  const created = row.createdAt ?? row.created_at;

  return {
    id: row.id,
    ts: formatTimestamp(created instanceof Date ? created : created ? new Date(created) : undefined),
    who: displayName(row, viewerUserId),
    msg,
    reason,
    warned,
    kind,
    runId,
  };
}
