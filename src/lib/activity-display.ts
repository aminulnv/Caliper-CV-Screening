import type { ActivityTone, JobAuditEntry } from '@/services/api'

const KIND_LABELS: Record<JobAuditEntry['kind'], string> = {
  criteria: 'Criteria',
  run: 'Screening',
  override: 'Override',
  candidate: 'Candidate',
  sync: 'Recruitee',
  job: 'Job',
  other: 'Activity',
}

const KIND_TONE: Record<JobAuditEntry['kind'], ActivityTone> = {
  run: 'brand',
  criteria: 'violet',
  candidate: 'ok',
  override: 'warn',
  sync: 'info',
  job: 'neutral',
  other: 'neutral',
}

const ACTION_ICONS: Record<string, string> = {
  'job.imported': 'database',
  'job.refreshed_recruitee': 'database',
  'job.upserted': 'doc',
  'job.criteria_generated': 'sparkle',
  'related_profiles.discover': 'search',
  'run.created': 'play',
  'run.completed': 'check',
  'run.failed': 'alert',
  'run.shared': 'share',
  'evaluation.override': 'edit',
  'evaluation.agree': 'thumb-up',
  'candidate.disposition_set': 'users',
  'candidate.recruitee_synced': 'database',
  'candidate.recruitee_sync_failed': 'alert',
  'settings.updated': 'sliders',
}

const KIND_ICONS: Record<JobAuditEntry['kind'], string> = {
  criteria: 'sliders',
  run: 'play',
  override: 'edit',
  candidate: 'users',
  sync: 'database',
  job: 'doc',
  other: 'history',
}

export function resolveActivityMeta(entry: JobAuditEntry) {
  const tone = entry.tone ?? KIND_TONE[entry.kind] ?? 'neutral'
  const actionLabel = entry.actionLabel ?? KIND_LABELS[entry.kind] ?? 'Activity'
  const icon = ACTION_ICONS[entry.action] ?? KIND_ICONS[entry.kind] ?? 'history'
  return { tone, actionLabel, icon }
}

export function splitActivityTimestamp(ts: string): { when: string; clock: string } {
  if (!ts || ts === '—') return { when: '—', clock: '' }
  const comma = ts.indexOf(',')
  if (comma === -1) return { when: ts, clock: '' }
  return {
    when: ts.slice(0, comma).trim(),
    clock: ts.slice(comma + 1).trim(),
  }
}
