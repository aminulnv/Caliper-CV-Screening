type AuditPayload = Record<string, unknown> | null;

type AuditRow = {
  action: string;
  payload: AuditPayload | string;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  jobId?: string | null;
  jobName?: string | null;
  createdAt?: Date;
  created_at?: Date;
};

export type AuditEntryKind = 'job' | 'criteria' | 'run' | 'override' | 'candidate' | 'sync' | 'other';

/** Visual tone for activity feed color-coding (maps to Caliper CSS tokens). */
export type ActivityTone =
  | 'brand'
  | 'info'
  | 'ok'
  | 'warn'
  | 'bad'
  | 'neutral'
  | 'violet';

export type FormattedAuditEntry = {
  id: string;
  action: string;
  actionLabel: string;
  tone: ActivityTone;
  ts: string;
  who: string;
  msg: string;
  reason: string;
  warned: boolean;
  kind: AuditEntryKind;
  runId: string | null;
  jobId: string | null;
  jobName: string | null;
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

function dispositionVerb(disposition: unknown, candidate: string): string {
  switch (disposition) {
    case 'shortlist':
      return `Shortlisted ${candidate}`;
    case 'hold':
      return `Put ${candidate} on hold`;
    case 'reject':
      return `Rejected ${candidate}`;
    case 'advanced':
      return `Advanced ${candidate}`;
    default:
      return `Updated disposition for ${candidate}`;
  }
}

function actionDisplay(
  action: string,
  payload: AuditPayload,
): { actionLabel: string; tone: ActivityTone } {
  const p = payload ?? {};
  switch (action) {
    case 'job.imported':
      return { actionLabel: 'Imported', tone: 'info' };
    case 'job.refreshed_recruitee':
      return { actionLabel: 'Refreshed', tone: 'info' };
    case 'job.upserted':
      return p.criteria_count != null
        ? { actionLabel: 'Criteria saved', tone: 'violet' }
        : { actionLabel: 'Job updated', tone: 'neutral' };
    case 'job.criteria_generated':
      return { actionLabel: 'AI generated', tone: 'violet' };
    case 'related_profiles.discover':
      return { actionLabel: 'Discovered', tone: 'violet' };
    case 'run.created':
      return { actionLabel: 'Started', tone: 'brand' };
    case 'run.completed':
      return { actionLabel: 'Completed', tone: 'ok' };
    case 'run.failed':
      return { actionLabel: 'Failed', tone: 'bad' };
    case 'run.shared':
      return { actionLabel: 'Shared', tone: 'brand' };
    case 'evaluation.override':
      return { actionLabel: 'Override', tone: 'warn' };
    case 'evaluation.agree':
      return { actionLabel: 'Agreed', tone: 'ok' };
    case 'candidate.disposition_set':
      switch (p.disposition) {
        case 'shortlist':
          return { actionLabel: 'Shortlisted', tone: 'ok' };
        case 'reject':
          return { actionLabel: 'Rejected', tone: 'bad' };
        case 'hold':
          return { actionLabel: 'On hold', tone: 'warn' };
        case 'advanced':
          return { actionLabel: 'Advanced', tone: 'info' };
        default:
          return { actionLabel: 'Disposition', tone: 'neutral' };
      }
    case 'candidate.recruitee_synced':
      return { actionLabel: 'Synced', tone: 'ok' };
    case 'candidate.recruitee_sync_failed':
      return { actionLabel: 'Sync failed', tone: 'bad' };
    case 'settings.updated':
      return { actionLabel: 'Settings', tone: 'neutral' };
    default:
      return { actionLabel: action.replace(/\./g, ' '), tone: 'neutral' };
  }
}

function formatUsdAudit(amount: number): string {
  if (amount === 0) return '$0.00';
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
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
    case 'job.criteria_generated': {
      const breakdown: string[] = [];
      if (typeof p.must_count === 'number') breakdown.push(`${p.must_count} must`);
      if (typeof p.nice_count === 'number') breakdown.push(`${p.nice_count} nice`);
      if (typeof p.flag_count === 'number') breakdown.push(`${p.flag_count} flag`);
      return {
        kind: 'criteria',
        runId: null,
        msg: `Generated criteria with AI${breakdown.length ? ` · ${breakdown.join(', ')}` : ''}`,
        reason: '—',
        warned: false,
      };
    }
    case 'related_profiles.discover':
      return {
        kind: 'other',
        runId: null,
        msg: `Discovered ${p.profiles_found ?? 0} similar profile${p.profiles_found === 1 ? '' : 's'}`,
        reason: '—',
        warned: false,
      };
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
    case 'run.shared': {
      const count = Array.isArray(p.shared_with) ? p.shared_with.length : 0;
      return {
        kind: 'run',
        runId,
        msg: `Shared screening results${count ? ` with ${count} member${count === 1 ? '' : 's'}` : ''}`,
        reason: '—',
        warned: false,
      };
    }
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
    case 'evaluation.agree': {
      const candidate = typeof p.candidate_name === 'string' ? p.candidate_name : 'a candidate';
      const criterion = typeof p.criterion_name === 'string' ? p.criterion_name : 'a criterion';
      return {
        kind: 'override',
        runId,
        msg: `Agreed with AI on “${criterion}” for ${candidate}`,
        reason: '—',
        warned: false,
      };
    }
    case 'candidate.disposition_set': {
      const candidate = typeof p.candidate_name === 'string' ? p.candidate_name : 'a candidate';
      const bulk = p.bulk === true ? ' (bulk)' : '';
      return {
        kind: 'candidate',
        runId,
        msg: `${dispositionVerb(p.disposition, candidate)}${bulk}`,
        reason: '—',
        warned: false,
      };
    }
    case 'candidate.recruitee_synced': {
      const candidate = typeof p.candidate_name === 'string' ? p.candidate_name : 'a candidate';
      return {
        kind: 'sync',
        runId,
        msg: `Synced ${candidate} to Recruitee`,
        reason: '—',
        warned: false,
      };
    }
    case 'candidate.recruitee_sync_failed': {
      const candidate = typeof p.candidate_name === 'string' ? p.candidate_name : 'a candidate';
      return {
        kind: 'sync',
        runId,
        msg: `Failed to sync ${candidate} to Recruitee`,
        reason:
          typeof p.sync_error === 'string' && p.sync_error.trim()
            ? p.sync_error.trim().slice(0, 200)
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
    case 'member.credits_topup': {
      const email = typeof p.member_email === 'string' ? p.member_email : 'a member';
      const amount = typeof p.amount_usd === 'number' ? p.amount_usd : null;
      const newBal = typeof p.new_budget_usd === 'number' ? p.new_budget_usd : null;
      const amountText = amount != null ? formatUsdAudit(amount) : 'credits';
      const balText = newBal != null ? ` (pool now ${formatUsdAudit(newBal)})` : '';
      return {
        kind: 'other',
        runId: null,
        msg: `Added ${amountText} AI credits for ${email}${balText}`,
        reason: '—',
        warned: false,
      };
    }
    case 'member.credits_unlimited': {
      const email = typeof p.member_email === 'string' ? p.member_email : 'a member';
      return {
        kind: 'other',
        runId: null,
        msg: `Set ${email} to unlimited AI credits (pay as you go)`,
        reason: '—',
        warned: false,
      };
    }
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
  const action = row.action;
  const { msg, reason, warned, kind, runId } = messageForAction(action, payload);
  const { actionLabel, tone } = actionDisplay(action, payload);
  const created = row.createdAt ?? row.created_at;
  const payloadJobId =
    payload && typeof payload.job_id === 'string' ? payload.job_id : null;

  return {
    id: row.id,
    action,
    actionLabel,
    tone,
    ts: formatTimestamp(created instanceof Date ? created : created ? new Date(created) : undefined),
    who: displayName(row, viewerUserId),
    msg,
    reason,
    warned,
    kind,
    runId,
    jobId: row.jobId ?? payloadJobId,
    jobName: row.jobName ?? null,
  };
}
