// @ts-nocheck
import React from 'react'
import { Btn, Icon, IconBtn, Badge } from '@/caliper/ui'
import { ConfirmModal } from '@/components/ConfirmModal'
import { RelatedProfileDetailSheet } from '@/caliper/components/RelatedProfileDetailSheet'
import { AppToast, useToast } from '@/caliper/components/AppToast'
import { api, NeedsCountryError, type RelatedProfileRow } from '@/services/api'
import { COUNTRY_NAMES, GLOBAL_SEARCH, GLOBAL_SEARCH_LABEL } from '@/lib/countries'
import {
  SCREENING_MODELS,
  isProviderConfigured,
  labelForModel,
  providerForModel,
  resolveRunnableModel,
} from '@/lib/screening-models'
import {
  displayBackground,
  displayCompany,
  displayLocation,
  displayTitle,
} from '@/lib/linkedin-profile-display'

const FILTER_DEBOUNCE_MS = 250
const DISCOVER_HINTS = [
  'Use broader job titles (e.g. drop "Senior")',
  'Remove location from the search prompt',
  'Try adjacent roles in the same domain',
]

type SortKey = 'fit' | 'name' | 'recent'

type ToastState = {
  message: string
  tone: 'ok' | 'bad'
  actionLabel?: string
  onAction?: () => void
}

function useDebouncedValue(value: string, delayMs: number) {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

function displayProfileName(name: string, linkedinUrl: string | null): string {
  if (!/\s[0-9a-f]{6,}$/i.test(name)) return name
  if (!linkedinUrl) return name.replace(/\s+[0-9a-f]{6,}$/i, '')
  const match = linkedinUrl.match(/\/in\/([^/?#]+)/i)
  if (!match) return name.replace(/\s+[0-9a-f]{6,}$/i, '')
  const slug = match[1].replace(/-[0-9a-f]{6,}$/i, '')
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function avatarTone(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i) * (i + 1)) % 5
  return `related-profiles-avatar--tone-${hash}`
}

function profileField(profile: RelatedProfileRow, snake: string, camel: string) {
  return profile[snake] ?? profile[camel] ?? null
}

function EmptyCell({ label = 'Not listed' }) {
  return <span className="related-profiles-table__empty">{label}</span>
}

function currentTitle(profile: RelatedProfileRow, jobName: string): string | null {
  const headline = profileField(profile, 'headline', 'headline')
  const title = profileField(profile, 'title', 'title')
  const summary = profileField(profile, 'profile_summary', 'profileSummary')
  return displayTitle(headline, title, summary, jobName)
}

function inferredCompany(profile: RelatedProfileRow): string | null {
  const company = profileField(profile, 'company', 'company')
  const summary = profileField(profile, 'profile_summary', 'profileSummary')
  const headline = profileField(profile, 'headline', 'headline')
  return displayCompany(company, summary, headline)
}

function inferredLocation(profile: RelatedProfileRow): string | null {
  const location = profileField(profile, 'location', 'location')
  const summary = profileField(profile, 'profile_summary', 'profileSummary')
  return displayLocation(location, summary)
}

function backgroundText(profile: RelatedProfileRow): string {
  const rationale = profileField(profile, 'alignment_rationale', 'alignmentRationale')
  if (rationale) return rationale
  const summary = profileField(profile, 'profile_summary', 'profileSummary')
  return displayBackground(summary)
}

function sortProfiles(profiles: RelatedProfileRow[], sortBy: SortKey, jobName: string) {
  const next = [...profiles]
  if (sortBy === 'name') {
    next.sort((a, b) => {
      const aName = displayProfileName(a.name, profileField(a, 'linkedin_url', 'linkedinUrl'))
      const bName = displayProfileName(b.name, profileField(b, 'linkedin_url', 'linkedinUrl'))
      return aName.localeCompare(bName)
    })
    return next
  }
  if (sortBy === 'recent') {
    next.sort((a, b) => {
      const aTs = Date.parse(a.created_at || a.discovered_at || '') || 0
      const bTs = Date.parse(b.created_at || b.discovered_at || '') || 0
      return bTs - aTs
    })
    return next
  }
  next.sort((a, b) => {
    const aStars = profileField(a, 'alignment_stars', 'alignmentStars') ?? -1
    const bStars = profileField(b, 'alignment_stars', 'alignmentStars') ?? -1
    if (bStars !== aStars) return bStars - aStars
    const aTs = Date.parse(a.discovered_at || a.created_at || '') || 0
    const bTs = Date.parse(b.discovered_at || b.created_at || '') || 0
    return bTs - aTs
  })
  return next
}

function StarRating({ stars, max = 5, size = 12, showValue = false }) {
  if (stars == null) return null
  return (
    <span className="star-rating" aria-label={`${stars} out of ${max} stars JD alignment`}>
      {Array.from({ length: max }, (_, i) => (
        <svg
          key={i}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          className={i < stars ? 'star-rating__star star-rating__star--on' : 'star-rating__star'}
          aria-hidden
        >
          <path d="M12 2l2.9 6.9 7.4.6-5.6 4.8 1.7 7.2L12 18.8 5.6 21.5l1.7-7.2L1.7 9.5l7.4-.6L12 2z" />
        </svg>
      ))}
      {showValue && (
        <span className="mono muted related-profiles-table__stars-val">{stars}/{max}</span>
      )}
    </span>
  )
}

function JdFitHeader() {
  return (
    <span className="related-profiles-table__jd-fit-head">
      JD fit
      <button
        type="button"
        className="related-profiles-table__jd-fit-info"
        title="Estimated fit to this job description (1–5 stars)."
        aria-label="Estimated fit to this job description, rated 1 to 5 stars"
      >
        <Icon name="info" size={12} aria-hidden />
      </button>
    </span>
  )
}


function buildIntroText(count: number, jobName: string, scope: string | null) {
  const isGlobal = scope?.toLowerCase().includes('global')
  const locPart = scope && !isGlobal ? ` from ${scope}` : ''
  return `${count} LinkedIn profile${count === 1 ? '' : 's'} matched to ${jobName}${locPart}.`
}

function configuredModels(settings) {
  if (!settings) return SCREENING_MODELS
  return SCREENING_MODELS.filter((m) => isProviderConfigured(m.provider, settings))
}

function RelatedProfilesModelSelect({ modelId, onChange, settings, disabled }) {
  const models = configuredModels(settings)
  const runnable = resolveRunnableModel(modelId, settings?.allowed_models, settings)
  const provider = providerForModel(modelId)

  return (
    <div className="related-profiles-toolbar__model">
      <label className="related-profiles-toolbar__model-label" htmlFor="related-profiles-ai-model">
        AI model
      </label>
      <select
        id="related-profiles-ai-model"
        className="sel related-profiles-toolbar__model-select"
        value={modelId}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || models.length === 0}
        title="Model used to derive search terms and score JD fit"
      >
        {models.length === 0 ? (
          <option value={modelId}>No API key configured</option>
        ) : (
          models.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))
        )}
      </select>
      {runnable.error && (
        <span className="related-profiles-toolbar__model-warn" title={runnable.error}>!</span>
      )}
      {runnable.substituted && !runnable.error && (
        <span className="related-profiles-toolbar__model-hint muted" title={`Will run as ${labelForModel(runnable.modelId)}`}>
          → {labelForModel(runnable.modelId)}
        </span>
      )}
      {provider === 'claude' && !isProviderConfigured('claude', settings) && (
        <span className="related-profiles-toolbar__model-hint muted">Add Anthropic key</span>
      )}
      {provider === 'openai' && !isProviderConfigured('openai', settings) && (
        <span className="related-profiles-toolbar__model-hint muted">Add OpenAI key</span>
      )}
    </div>
  )
}

function SearchPromptEditor({
  value,
  onChange,
  onReset,
  suggesting,
  disabled,
  showReset,
  meta,
  needsCountry,
  selectedCountry,
  onCountryChange,
}) {
  return (
    <div className="related-profiles-query-field">
      <div className="related-profiles-query-field__head">
        <label className="related-profiles-query-field__label" htmlFor="related-profiles-search-prompt">
          Search prompt
        </label>
        {showReset && (
          <button
            type="button"
            className="related-profiles-query-field__reset"
            onClick={onReset}
            disabled={disabled || suggesting}
          >
            Reset to AI suggestion
          </button>
        )}
      </div>
      <p className="related-profiles-query-field__hint muted">
        AI-recommended LinkedIn search terms — edit before running Suggest profiles.
      </p>
      <textarea
        id="related-profiles-search-prompt"
        className="ta related-profiles-query-field__input mono"
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || suggesting}
        placeholder={suggesting ? 'Generating search terms from the job description…' : 'Search prompt will appear here'}
        spellCheck
        aria-describedby="related-profiles-search-prompt-hint"
      />
      {needsCountry && (
        <div className="related-profiles-query-field__location">
          <label className="related-profiles-query-field__location-label" htmlFor="related-profiles-country">
            Search location
          </label>
          <select
            id="related-profiles-country"
            className="sel related-profiles-query-field__location-select"
            value={selectedCountry}
            onChange={(e) => onCountryChange(e.target.value)}
            disabled={disabled || suggesting}
          >
            <option value={GLOBAL_SEARCH}>{GLOBAL_SEARCH_LABEL}</option>
            {COUNTRY_NAMES.map((country) => (
              <option key={country} value={country}>{country}</option>
            ))}
          </select>
          <p className="related-profiles-query-field__location-hint muted">
            No location in the job description — choose a country or Global, then edit the prompt if needed.
          </p>
        </div>
      )}
      <div id="related-profiles-search-prompt-hint" className="related-profiles-query-field__footer">
        {suggesting ? (
          <span className="related-profiles-query-field__status" role="status">
            <span className="related-profiles-pane__pulse" aria-hidden />
            Generating search terms…
          </span>
        ) : meta ? (
          <div className="related-profiles-meta related-profiles-query-field__meta">
            {meta.searchProvider && (
              <span className="related-profiles-meta__pill">{meta.searchProvider}</span>
            )}
            {meta.locationScope && (
              <span className="related-profiles-meta__pill">{meta.locationScope}</span>
            )}
            {meta.seniorityLevel && (
              <span className="related-profiles-meta__pill" title="Target seniority band for this search">
                {meta.seniorityLevel}
              </span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function RelatedProfilesLoading() {
  return (
    <div className="card related-profiles-loading" aria-busy="true" aria-label="Loading related profiles">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="related-profiles-loading__row">
          <div className="related-profiles-loading__avatar" />
          <div className="related-profiles-loading__lines">
            <div className="related-profiles-loading__line" />
            <div className="related-profiles-loading__line related-profiles-loading__line--short" />
          </div>
        </div>
      ))}
    </div>
  )
}

function ProfileRowActions({
  displayName,
  profile,
  canEdit,
  onViewDetails,
  onRequestRemove,
}) {
  return (
    <div className="related-profiles-row-actions">
      <button
        type="button"
        className="related-profiles-row-actions__details"
        onClick={() => onViewDetails(profile)}
        aria-label={`View details for ${displayName}`}
      >
        Details
      </button>
      {canEdit && (
        <IconBtn
          className="related-profiles-row-action related-profiles-row-action--danger"
          name="trash"
          size={14}
          aria-label={`Remove ${displayName} from talent list`}
          onClick={() => onRequestRemove(profile)}
        />
      )}
    </div>
  )
}

function RelatedProfileCard({
  profile,
  index,
  jobName,
  hasScoredProfiles,
  canEdit,
  onViewDetails,
  onRequestRemove,
}) {
  const linkedinUrl = profileField(profile, 'linkedin_url', 'linkedinUrl')
  const displayName = displayProfileName(profile.name, linkedinUrl)
  const title = currentTitle(profile, jobName)
  const company = inferredCompany(profile)
  const location = inferredLocation(profile)
  const bg = backgroundText(profile)
  const stars = profileField(profile, 'alignment_stars', 'alignmentStars')

  return (
    <article className="related-profiles-card">
      <div className="related-profiles-card__head">
        <span className={`related-profiles-avatar ${avatarTone(displayName)}`} aria-hidden>
          {initialsFromName(displayName)}
        </span>
        <div className="related-profiles-card__head-text">
          {linkedinUrl ? (
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="related-profiles-table__name"
            >
              {displayName}
              <Icon name="external" size={11} className="related-profiles-table__ext" />
            </a>
          ) : (
            <span className="related-profiles-table__name related-profiles-table__name--plain">
              {displayName}
            </span>
          )}
          {hasScoredProfiles && stars != null && (
            <div className="related-profiles-card__fit">
              <StarRating stars={stars} size={11} showValue />
            </div>
          )}
        </div>
        <span className="related-profiles-card__index muted" aria-hidden>#{index + 1}</span>
      </div>
      <dl className="related-profiles-card__meta">
        <div>
          <dt>Title</dt>
          <dd>{title || 'Not listed'}</dd>
        </div>
        <div>
          <dt>Company</dt>
          <dd>{company || 'Not listed'}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{location || 'Not listed'}</dd>
        </div>
      </dl>
      {bg !== '—' && (
        <p className="related-profiles-card__bg">{bg}</p>
      )}
      <ProfileRowActions
        displayName={displayName}
        profile={profile}
        canEdit={canEdit}
        onViewDetails={onViewDetails}
        onRequestRemove={onRequestRemove}
      />
    </article>
  )
}

export function RelatedProfilesPane({
  jobId,
  jobName,
  hasDescription,
  isHero,
  workspaceSettings,
  screeningModel,
  canEdit = true,
  onProfilesChange,
  onGoToOverview,
}) {
  const defaultModelId =
    screeningModel || workspaceSettings?.default_model || 'claude-sonnet-4-6'
  const [modelId, setModelId] = React.useState(defaultModelId)
  const [profiles, setProfiles] = React.useState<RelatedProfileRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [discovering, setDiscovering] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [draftQuery, setDraftQuery] = React.useState('')
  const [queryTouched, setQueryTouched] = React.useState(false)
  const [suggesting, setSuggesting] = React.useState(false)
  const [suggestMeta, setSuggestMeta] = React.useState<{
    searchProvider: string | null
    locationScope: string | null
    seniorityLevel: string | null
  } | null>(null)
  const [lastSearchQuery, setLastSearchQuery] = React.useState<string | null>(null)
  const [lastSearchProvider, setLastSearchProvider] = React.useState<string | null>(null)
  const [lastLocationScope, setLastLocationScope] = React.useState<string | null>(null)
  const [lastSeniorityLevel, setLastSeniorityLevel] = React.useState<string | null>(null)
  const [needsCountry, setNeedsCountry] = React.useState(false)
  const [selectedCountry, setSelectedCountry] = React.useState(GLOBAL_SEARCH)
  const [profileQuery, setProfileQuery] = React.useState('')
  const [sortBy, setSortBy] = React.useState<SortKey>('fit')
  const [refineOpen, setRefineOpen] = React.useState(false)
  const [discoverAttempted, setDiscoverAttempted] = React.useState(false)
  const [pendingRemove, setPendingRemove] = React.useState<RelatedProfileRow | null>(null)
  const [detailProfile, setDetailProfile] = React.useState<RelatedProfileRow | null>(null)
  const { toast, showToast, dismissToast } = useToast()
  const [liveMessage, setLiveMessage] = React.useState('')
  const queryTouchedRef = React.useRef(false)
  const debouncedProfileQuery = useDebouncedValue(profileQuery, FILTER_DEBOUNCE_MS)

  React.useEffect(() => {
    queryTouchedRef.current = queryTouched
  }, [queryTouched])

  React.useEffect(() => {
    if (queryTouched || needsCountry) setRefineOpen(true)
  }, [queryTouched, needsCountry])

  const load = React.useCallback(() => {
    if (isHero || !jobId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    api.jobs
      .relatedProfiles(jobId)
      .then((rows) => {
        setProfiles(rows)
        onProfilesChange?.(rows.length)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [jobId, isHero, onProfilesChange])

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    setModelId(screeningModel || workspaceSettings?.default_model || 'claude-sonnet-4-6')
  }, [screeningModel, workspaceSettings?.default_model, jobId])

  React.useEffect(() => {
    setDraftQuery('')
    setQueryTouched(false)
    queryTouchedRef.current = false
    setSuggestMeta(null)
    setLastSearchQuery(null)
    setLastSearchProvider(null)
    setLastLocationScope(null)
    setLastSeniorityLevel(null)
    setNeedsCountry(false)
    setSelectedCountry(GLOBAL_SEARCH)
    setProfileQuery('')
    setSortBy('fit')
    setRefineOpen(false)
    setDiscoverAttempted(false)
    setPendingRemove(null)
    setDetailProfile(null)
    dismissToast()
  }, [jobId])

  const applySuggestion = React.useCallback((res: {
    search_query: string
    search_provider?: string | null
    location_scope?: string | null
    seniority_level?: string | null
  }, force = false) => {
    if (force || !queryTouchedRef.current) {
      setDraftQuery(res.search_query)
      if (force) {
        setQueryTouched(false)
        queryTouchedRef.current = false
      }
    }
    setSuggestMeta({
      searchProvider: res.search_provider ?? null,
      locationScope: res.location_scope ?? null,
      seniorityLevel: res.seniority_level ?? null,
    })
  }, [])

  const fetchSuggestion = React.useCallback(async (searchCountry?: string, force = false) => {
    if (!hasDescription || isHero) return
    setSuggesting(true)
    setError(null)
    try {
      const res = await api.jobs.suggestRelatedProfileSearch(jobId, {
        model_id: modelId,
        ...(searchCountry ? { search_country: searchCountry } : {}),
      })
      applySuggestion(res, force)
    } catch (e) {
      if (e instanceof NeedsCountryError) {
        setNeedsCountry(true)
        setError(null)
        if (!searchCountry) {
          try {
            const retry = await api.jobs.suggestRelatedProfileSearch(jobId, {
              model_id: modelId,
              search_country: selectedCountry,
            })
            applySuggestion(retry, force)
          } catch (retryErr) {
            if (!(retryErr instanceof NeedsCountryError)) {
              setError(retryErr instanceof Error ? retryErr.message : 'Could not suggest search terms')
            }
          }
        }
      } else {
        setError(e instanceof Error ? e.message : 'Could not suggest search terms')
      }
    } finally {
      setSuggesting(false)
    }
  }, [applySuggestion, hasDescription, isHero, jobId, modelId, selectedCountry])

  React.useEffect(() => {
    if (!canEdit || !hasDescription || isHero) return undefined
    const timer = window.setTimeout(() => {
      void fetchSuggestion()
    }, 350)
    return () => window.clearTimeout(timer)
  }, [canEdit, hasDescription, isHero, modelId, jobId, fetchSuggestion])

  const resetQueryToSuggestion = () => {
    void fetchSuggestion(needsCountry ? selectedCountry : undefined, true)
  }

  const handleCountryChange = (country: string) => {
    setSelectedCountry(country)
    void fetchSuggestion(country, !queryTouchedRef.current)
  }

  const searchCountryParam = needsCountry ? selectedCountry : undefined

  const runDiscover = async () => {
    if (!hasDescription) return
    const trimmedQuery = draftQuery.trim()
    if (!trimmedQuery) {
      setError('Add a search prompt before running Suggest profiles.')
      return
    }
    setDiscovering(true)
    setError(null)
    setDiscoverAttempted(true)
    try {
      const res = await api.jobs.discoverRelatedProfiles(jobId, {
        limit: 10,
        model_id: modelId,
        search_query: trimmedQuery,
        ...(searchCountryParam ? { search_country: searchCountryParam } : {}),
      })
      setProfiles(res.profiles)
      onProfilesChange?.(res.profiles.length)
      setDraftQuery(res.search_query)
      setQueryTouched(false)
      setLastSearchQuery(res.search_query)
      setLastSearchProvider(res.search_provider)
      setLastLocationScope(res.location_scope ?? res.location_query ?? null)
      setLastSeniorityLevel(res.seniority_level ?? null)
      setSuggestMeta({
        searchProvider: res.search_provider ?? null,
        locationScope: res.location_scope ?? res.location_query ?? null,
        seniorityLevel: res.seniority_level ?? null,
      })
      const count = res.profiles.length
      const msg = count === 0
        ? 'No profiles matched this search.'
        : `Found ${count} profile${count === 1 ? '' : 's'} for this job.`
      setLiveMessage(msg)
      showToast({ message: msg, tone: count === 0 ? 'bad' : 'ok' })
    } catch (e) {
      if (e instanceof NeedsCountryError) {
        setNeedsCountry(true)
        setError(null)
      } else {
        const message = e instanceof Error ? e.message : 'Discovery failed'
        setError(message)
        showToast({
          message,
          tone: 'bad',
          actionLabel: 'Retry',
          onAction: () => {
            dismissToast()
            void runDiscover()
          },
        })
      }
    } finally {
      setDiscovering(false)
    }
  }

  const requestRemove = (profile: RelatedProfileRow) => {
    setPendingRemove(profile)
  }

  const confirmRemove = async () => {
    if (!pendingRemove) return
    const profileId = pendingRemove.id
    const linkedinUrl = profileField(pendingRemove, 'linkedin_url', 'linkedinUrl')
    const displayName = displayProfileName(pendingRemove.name, linkedinUrl)
    try {
      await api.jobs.deleteRelatedProfile(jobId, profileId)
      setProfiles((prev) => {
        const next = prev.filter((p) => p.id !== profileId)
        onProfilesChange?.(next.length)
        return next
      })
      showToast({ message: `Removed ${displayName}`, tone: 'ok' })
      setLiveMessage(`Removed ${displayName} from talent list.`)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not remove profile'
      setError(message)
      showToast({ message, tone: 'bad' })
    } finally {
      setPendingRemove(null)
    }
  }

  const hasScoredProfiles = profiles.some((p) => profileField(p, 'alignment_stars', 'alignmentStars') != null)
  const displayLocationScope = lastLocationScope
  const showSearchMeta = canEdit && lastSearchQuery && lastSearchQuery !== '(mock mode)'

  const filteredProfiles = React.useMemo(() => {
    const sorted = sortProfiles(profiles, sortBy, jobName)
    const q = debouncedProfileQuery.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((p) => {
      const linkedinUrl = profileField(p, 'linkedin_url', 'linkedinUrl')
      const displayName = displayProfileName(p.name, linkedinUrl)
      const title = currentTitle(p, jobName)
      const company = inferredCompany(p)
      const location = inferredLocation(p)
      const bg = backgroundText(p)
      return [displayName, title, company, location, bg]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    })
  }, [profiles, debouncedProfileQuery, jobName, sortBy])

  const pendingRemoveName = pendingRemove
    ? displayProfileName(
        pendingRemove.name,
        profileField(pendingRemove, 'linkedin_url', 'linkedinUrl'),
      )
    : ''

  if (isHero) {
    return (
      <div className="card related-profiles-hero-empty">
        <div className="empty">
          <div className="related-profiles-hero-empty__icon">
            <Icon name="users" size={22} />
          </div>
          <div className="related-profiles-hero-empty__title">Suggested Profiles for This Job</div>
          <p className="related-profiles-hero-empty__copy muted">
            Open a real job to search LinkedIn for candidates matching your job description.
          </p>
        </div>
      </div>
    )
  }

  const paneClass = canEdit
    ? 'col related-profiles-pane'
    : 'col related-profiles-pane related-profiles-pane--readonly'

  return (
    <div className={paneClass}>
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">{liveMessage}</div>

      {!canEdit && (
        <div className="callout related-profiles-callout related-profiles-callout--readonly">
          <Icon name="lock" size={14} aria-hidden />
          <span>
            View-only access. Review saved LinkedIn suggestions for this job; discovering or removing profiles requires editor or admin access.
          </span>
        </div>
      )}

      {canEdit && (
        <div className="card related-profiles-toolbar">
          <div className="card__head related-profiles-toolbar__head">
            <div className="related-profiles-toolbar__title-group">
              <Icon name="users" size={14} className="muted" />
              <span className="card__title">Discover profiles</span>
              {profiles.length > 0 && (
                <Badge tone="info">{profiles.length} saved</Badge>
              )}
            </div>
            <div className="spacer" />
            {refineOpen && (
              <RelatedProfilesModelSelect
                modelId={modelId}
                onChange={setModelId}
                settings={workspaceSettings}
                disabled={discovering}
              />
            )}
            <Btn
              variant="primary"
              icon="sparkle"
              size="sm"
              disabled={!hasDescription || discovering || suggesting || !draftQuery.trim()}
              onClick={() => runDiscover()}
            >
              {discovering ? 'Finding profiles…' : 'Suggest profiles'}
            </Btn>
          </div>
          <div className="card__body col related-profiles-toolbar__body">
            {!hasDescription && (
              <div className="related-profiles-empty related-profiles-empty--inline">
                <p className="related-profiles-empty__copy muted">
                  Add a job description on the Overview tab before suggesting profiles.
                </p>
                {onGoToOverview && (
                  <Btn variant="default" size="sm" icon="doc" onClick={onGoToOverview}>
                    Go to Overview
                  </Btn>
                )}
              </div>
            )}
            {hasDescription && !refineOpen && (
              <div className="related-profiles-toolbar__compact">
                <p className="related-profiles-toolbar__compact-lead muted">
                  {suggesting
                    ? 'Generating LinkedIn search terms from your job description…'
                    : 'Search terms are ready. Run Suggest profiles or refine the query first.'}
                </p>
                {draftQuery.trim() && !suggesting && (
                  <p className="related-profiles-toolbar__preview mono">{draftQuery}</p>
                )}
                <button
                  type="button"
                  className="related-profiles-toolbar__refine-toggle"
                  onClick={() => setRefineOpen(true)}
                  disabled={discovering}
                >
                  Refine search
                  <Icon name="chevron-down" size={12} aria-hidden />
                </button>
              </div>
            )}
            {hasDescription && refineOpen && (
              <>
                <div className="related-profiles-toolbar__refine-head">
                  <span className="related-profiles-toolbar__refine-label">Advanced search</span>
                  <button
                    type="button"
                    className="related-profiles-toolbar__refine-toggle"
                    onClick={() => setRefineOpen(false)}
                    disabled={discovering || needsCountry}
                  >
                    Collapse
                    <Icon name="chevron-down" size={12} style={{ transform: 'rotate(180deg)' }} aria-hidden />
                  </button>
                </div>
                <SearchPromptEditor
                  value={draftQuery}
                  onChange={(value) => {
                    setDraftQuery(value)
                    setQueryTouched(true)
                    queryTouchedRef.current = true
                  }}
                  onReset={resetQueryToSuggestion}
                  suggesting={suggesting}
                  disabled={discovering}
                  showReset={queryTouched}
                  meta={suggestMeta}
                  needsCountry={needsCountry}
                  selectedCountry={selectedCountry}
                  onCountryChange={handleCountryChange}
                />
              </>
            )}
            {discovering && (
              <div className="related-profiles-pane__status related-profiles-pane__status--active" role="status">
                <span className="related-profiles-pane__pulse" aria-hidden />
                <Icon name="sparkle" size={13} />
                <span>Searching LinkedIn for matching profiles…</span>
              </div>
            )}
            {showSearchMeta && !discovering && (
              <div className="related-profiles-pane__status related-profiles-pane__status--done" role="status">
                <Icon name="check" size={13} />
                <span>Search complete</span>
                <div className="related-profiles-meta">
                  {lastSearchProvider && (
                    <span className="related-profiles-meta__pill">{lastSearchProvider}</span>
                  )}
                  {displayLocationScope && (
                    <span className="related-profiles-meta__pill">{displayLocationScope}</span>
                  )}
                  {lastSeniorityLevel && (
                    <span className="related-profiles-meta__pill" title="Target seniority band for this search">
                      {lastSeniorityLevel}
                    </span>
                  )}
                </div>
              </div>
            )}
            {error && (
              <div className="related-profiles-error" role="alert">
                {error}
                {discoverAttempted && (
                  <button
                    type="button"
                    className="related-profiles-error__retry"
                    onClick={() => {
                      setError(null)
                      void runDiscover()
                    }}
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {!canEdit && error && !loading && (
        <div className="related-profiles-error" role="alert">{error}</div>
      )}

      {loading ? (
        <RelatedProfilesLoading />
      ) : profiles.length === 0 ? (
        <div className="card related-profiles-empty">
          <div className="empty">
            <div className="related-profiles-empty__icon">
              <Icon name="search" size={22} />
            </div>
            <div className="related-profiles-empty__title">
              {discoverAttempted ? 'No profiles matched this search' : 'No suggested profiles yet'}
            </div>
            <p className="related-profiles-empty__copy muted">
              {discoverAttempted
                ? 'Try broader titles or locations, then run Suggest profiles again.'
                : canEdit
                  ? <>Run <strong>Suggest profiles</strong> to discover LinkedIn candidates aligned with this job description.</>
                  : 'Editors and admins can discover LinkedIn candidates for this job from the job description.'}
            </p>
            {canEdit && discoverAttempted && (
              <div className="related-profiles-empty__hints">
                {DISCOVER_HINTS.map((hint) => (
                  <span key={hint} className="related-profiles-empty__hint-chip">{hint}</span>
                ))}
                <Btn
                  variant="default"
                  size="sm"
                  icon="sparkle"
                  onClick={() => setRefineOpen(true)}
                >
                  Edit search & retry
                </Btn>
              </div>
            )}
            {canEdit && !discoverAttempted && !hasDescription && onGoToOverview && (
              <Btn variant="default" size="sm" icon="doc" onClick={onGoToOverview}>
                Add job description
              </Btn>
            )}
            {canEdit && !discoverAttempted && hasDescription && (
              <Btn
                variant="primary"
                size="sm"
                icon="sparkle"
                disabled={discovering || suggesting || !draftQuery.trim()}
                onClick={() => runDiscover()}
              >
                Suggest profiles
              </Btn>
            )}
          </div>
        </div>
      ) : (
        <div className="card related-profiles-results">
          <div className="related-profiles-results__head">
            <div className="related-profiles-results__copy">
              <p className="related-profiles-results__headline">
                {!canEdit && (
                  <Icon name="lock" size={12} className="related-profiles-results__readonly-icon" aria-hidden />
                )}
                {buildIntroText(filteredProfiles.length, jobName, displayLocationScope)}
              </p>
              {profiles.length > 0 && (
                <p className="related-profiles-results__count muted">
                  Showing {filteredProfiles.length} of {profiles.length}
                </p>
              )}
            </div>
            <div className="related-profiles-results__controls">
              <label className="related-profiles-results__sort">
                <span className="muted">Sort</span>
                <select
                  className="sel related-profiles-results__sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  aria-label="Sort suggested profiles"
                >
                  <option value="fit">JD fit (high to low)</option>
                  <option value="name">Name (A–Z)</option>
                  <option value="recent">Recently added</option>
                </select>
              </label>
              <div className="related-profiles-results__stat" aria-hidden>
                <span className="related-profiles-results__stat-val">{filteredProfiles.length}</span>
                <span className="related-profiles-results__stat-lbl">Profiles</span>
              </div>
            </div>
          </div>

          <div className="related-profiles-results__filter">
            <Icon name="search" size={14} className="muted" aria-hidden />
            <input
              className="inp"
              type="search"
              value={profileQuery}
              onChange={(e) => setProfileQuery(e.target.value)}
              placeholder="Filter by name, title, company…"
              aria-label="Filter suggested profiles"
            />
            {profileQuery.trim() && (
              <button
                type="button"
                className="related-profiles-results__filter-clear"
                onClick={() => setProfileQuery('')}
              >
                Clear filter
              </button>
            )}
          </div>

          {filteredProfiles.length === 0 ? (
            <div className="related-profiles-results__filter-empty">
              <p className="muted">No profiles match “{profileQuery.trim()}”.</p>
              <Btn variant="ghost" size="sm" onClick={() => setProfileQuery('')}>
                Clear filter
              </Btn>
            </div>
          ) : (
            <>
              <div className="related-profiles-table-wrap related-profiles-table-wrap--desktop">
                <table className="tbl related-profiles-table">
                  <thead>
                    <tr>
                      <th className="col-num" style={{ width: 40 }}>#</th>
                      <th style={{ minWidth: 168 }}>Name</th>
                      <th style={{ minWidth: 160 }}>Current title</th>
                      <th style={{ minWidth: 120 }}>Company</th>
                      <th style={{ minWidth: 108 }}>Location</th>
                      <th style={{ minWidth: 220 }}>Background</th>
                      {hasScoredProfiles && (
                        <th style={{ width: 96 }} aria-sort={sortBy === 'fit' ? 'descending' : 'none'}>
                          <JdFitHeader />
                        </th>
                      )}
                      <th className="related-profiles-table__actions-col" style={{ minWidth: 120 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProfiles.map((p, index) => {
                      const linkedinUrl = profileField(p, 'linkedin_url', 'linkedinUrl')
                      const displayName = displayProfileName(p.name, linkedinUrl)
                      const title = currentTitle(p, jobName)
                      const company = inferredCompany(p)
                      const location = inferredLocation(p)
                      const bg = backgroundText(p)
                      const stars = profileField(p, 'alignment_stars', 'alignmentStars')

                      return (
                        <tr key={p.id} className="related-profiles-table__row">
                          <td className="col-num muted">{index + 1}</td>
                          <td>
                            <div className="related-profiles-name-cell">
                              <span
                                className={`related-profiles-avatar ${avatarTone(displayName)}`}
                                aria-hidden
                              >
                                {initialsFromName(displayName)}
                              </span>
                              <div className="related-profiles-name-cell__text">
                                {linkedinUrl ? (
                                  <a
                                    href={linkedinUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="related-profiles-table__name"
                                  >
                                    {displayName}
                                    <Icon name="external" size={11} className="related-profiles-table__ext" />
                                  </a>
                                ) : (
                                  <span className="related-profiles-table__name related-profiles-table__name--plain">
                                    {displayName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="related-profiles-table__title">
                            {title ? title : <EmptyCell />}
                          </td>
                          <td className="related-profiles-table__company">
                            {company ? company : <EmptyCell />}
                          </td>
                          <td className="related-profiles-table__location">
                            {location ? location : <EmptyCell />}
                          </td>
                          <td className="related-profiles-table__bg">
                            {bg === '—' ? (
                              <EmptyCell label="No summary" />
                            ) : (
                              <button
                                type="button"
                                className="related-profiles-table__bg-btn"
                                onClick={() => setDetailProfile(p)}
                                aria-label={`View background for ${displayName}`}
                              >
                                {bg}
                              </button>
                            )}
                          </td>
                          {hasScoredProfiles && (
                            <td>
                              {stars != null ? (
                                <div className="related-profiles-table__stars">
                                  <StarRating stars={stars} showValue />
                                </div>
                              ) : (
                                <EmptyCell />
                              )}
                            </td>
                          )}
                          <td className="related-profiles-table__actions-col">
                            <ProfileRowActions
                              displayName={displayName}
                              profile={p}
                              canEdit={canEdit}
                              onViewDetails={setDetailProfile}
                              onRequestRemove={requestRemove}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="related-profiles-cards related-profiles-cards--mobile">
                {filteredProfiles.map((p, index) => (
                  <RelatedProfileCard
                    key={p.id}
                    profile={p}
                    index={index}
                    jobName={jobName}
                    hasScoredProfiles={hasScoredProfiles}
                    canEdit={canEdit}
                    onViewDetails={setDetailProfile}
                    onRequestRemove={requestRemove}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <ConfirmModal
        open={Boolean(pendingRemove)}
        onClose={() => setPendingRemove(null)}
        onConfirm={() => { void confirmRemove() }}
        title="Remove profile?"
        message={`Remove ${pendingRemoveName} from this job's talent list? They can be rediscovered later.`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
      />

      <RelatedProfileDetailSheet
        profile={detailProfile}
        jobName={jobName}
        onClose={() => setDetailProfile(null)}
        canEdit={canEdit}
        onRemove={requestRemove}
      />

      <AppToast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}
