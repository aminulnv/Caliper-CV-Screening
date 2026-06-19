export type UsageFeatureTone = 'brand' | 'info' | 'ok' | 'violet' | 'neutral'

export type UsageFeatureMeta = {
  label: string
  tone: UsageFeatureTone
  icon: string
}

export const USAGE_FEATURE_META: Record<string, UsageFeatureMeta> = {
  screening: { label: 'Screening', tone: 'brand', icon: 'play' },
  criteria_gen: { label: 'Criteria generation', tone: 'violet', icon: 'sparkle' },
  embedding: { label: 'CV embedding', tone: 'info', icon: 'file' },
  cv_search: { label: 'Talent search', tone: 'brand', icon: 'search' },
  discovery: { label: 'Profile discovery', tone: 'violet', icon: 'users' },
  jd_alignment: { label: 'Profile alignment', tone: 'neutral', icon: 'sliders' },
}

export function featureMeta(key: string): UsageFeatureMeta {
  return USAGE_FEATURE_META[key] ?? {
    label: key.replace(/_/g, ' '),
    tone: 'neutral',
    icon: 'sparkle',
  }
}

export function statusMeterClass(status: string): string {
  if (status === 'blocked') return 'bad'
  if (status === 'warn') return 'warn'
  return 'ok'
}
