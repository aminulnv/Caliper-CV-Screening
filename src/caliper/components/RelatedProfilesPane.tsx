// @ts-nocheck
import React from 'react'
import { Btn, Icon, IconBtn, Badge } from '@/caliper/ui'
import { api, NeedsCountryError, type RelatedProfileRow } from '@/services/api'
import { COUNTRY_NAMES, GLOBAL_SEARCH, GLOBAL_SEARCH_LABEL } from '@/lib/countries'
import {
  displayBackground,
  displayCompany,
  displayLocation,
  displayTitle,
} from '@/lib/linkedin-profile-display'

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

function StarRating({ stars, max = 5, size = 12 }) {
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
    </span>
  )
}

function buildIntroText(count: number, jobName: string, scope: string | null) {
  const isGlobal = scope?.toLowerCase().includes('global')
  const locPart = scope && !isGlobal ? ` from ${scope}` : ''
  return `${count} LinkedIn profile${count === 1 ? '' : 's'} matched to ${jobName}${locPart}.`
}

function RelatedProfilesLoading() {
  return (
    <div className="card related-profiles-loading" aria-busy="true" aria-label="Loading related profiles">
      {[0, 1, 2, 3].map((i) => (
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

export function RelatedProfilesPane({ jobId, jobName, hasDescription, isHero }) {
  const [profiles, setProfiles] = React.useState<RelatedProfileRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [discovering, setDiscovering] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [lastSearchQuery, setLastSearchQuery] = React.useState<string | null>(null)
  const [lastSearchProvider, setLastSearchProvider] = React.useState<string | null>(null)
  const [lastLocationScope, setLastLocationScope] = React.useState<string | null>(null)
  const [showCountryPicker, setShowCountryPicker] = React.useState(false)
  const [selectedCountry, setSelectedCountry] = React.useState(GLOBAL_SEARCH)

  const load = React.useCallback(() => {
    if (isHero || !jobId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    api.jobs
      .relatedProfiles(jobId)
      .then(setProfiles)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [jobId, isHero])

  React.useEffect(() => { load() }, [load])

  const runDiscover = async (searchCountry?: string) => {
    if (!hasDescription) return
    setDiscovering(true)
    setError(null)
    try {
      const res = await api.jobs.discoverRelatedProfiles(jobId, {
        limit: 10,
        ...(searchCountry ? { search_country: searchCountry } : {}),
      })
      setShowCountryPicker(false)
      setProfiles(res.profiles)
      setLastSearchQuery(res.search_query)
      setLastSearchProvider(res.search_provider)
      setLastLocationScope(res.location_scope ?? res.location_query ?? null)
    } catch (e) {
      if (e instanceof NeedsCountryError) {
        setShowCountryPicker(true)
        setError(null)
      } else {
        setError(e instanceof Error ? e.message : 'Discovery failed')
      }
    } finally {
      setDiscovering(false)
    }
  }

  const confirmCountrySearch = () => {
    runDiscover(selectedCountry)
  }

  const removeProfile = async (profileId: string) => {
    try {
      await api.jobs.deleteRelatedProfile(jobId, profileId)
      setProfiles((prev) => prev.filter((p) => p.id !== profileId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove profile')
    }
  }

  const hasScoredProfiles = profiles.some((p) => profileField(p, 'alignment_stars', 'alignmentStars') != null)
  const displayLocation = lastLocationScope
  const showSearchMeta = lastSearchQuery && lastSearchQuery !== '(mock mode)'

  if (isHero) {
    return (
      <div className="card related-profiles-hero-empty">
        <div className="empty">
          <div className="related-profiles-hero-empty__icon">
            <Icon name="users" size={22}/>
          </div>
          <div className="related-profiles-hero-empty__title">Related profiles</div>
          <p className="related-profiles-hero-empty__copy muted">
            Open a real job to search LinkedIn for candidates matching your job description.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="col related-profiles-pane">
      <div className="card related-profiles-toolbar">
        <div className="card__head related-profiles-toolbar__head">
          <div className="related-profiles-toolbar__title-group">
            <Icon name="users" size={14} className="muted"/>
            <span className="card__title">Related profiles</span>
            {profiles.length > 0 && (
              <Badge tone="info">{profiles.length} found</Badge>
            )}
          </div>
          <div className="spacer"/>
          <Btn
            variant="primary"
            icon="sparkle"
            size="sm"
            disabled={!hasDescription || discovering}
            onClick={() => runDiscover()}
          >
            {discovering ? 'Finding profiles…' : 'Suggest profiles'}
          </Btn>
        </div>
        <div className="card__body col related-profiles-toolbar__body">
          {!hasDescription && (
            <div className="callout related-profiles-callout">
              Add a job description on the <strong>Overview</strong> tab before running discovery.
            </div>
          )}
          {showCountryPicker && (
            <div className="related-profiles-country-picker" role="region" aria-label="Search location">
              <p className="related-profiles-country-picker__lead">
                No location was found in the job description. Choose a country to focus the search, or Global for worldwide results.
              </p>
              <div className="related-profiles-country-picker__row">
                <label className="related-profiles-country-picker__label" htmlFor="related-profiles-country">
                  Search scope
                </label>
                <select
                  id="related-profiles-country"
                  className="sel related-profiles-country-picker__select"
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  disabled={discovering}
                >
                  <option value={GLOBAL_SEARCH}>{GLOBAL_SEARCH_LABEL}</option>
                  {COUNTRY_NAMES.map((country) => (
                    <option key={country} value={country}>{country}</option>
                  ))}
                </select>
                <Btn
                  variant="primary"
                  icon="search"
                  size="sm"
                  disabled={discovering}
                  onClick={confirmCountrySearch}
                >
                  {discovering ? 'Searching…' : 'Search profiles'}
                </Btn>
              </div>
            </div>
          )}
          {discovering && (
            <div className="related-profiles-pane__status related-profiles-pane__status--active" role="status">
              <span className="related-profiles-pane__pulse" aria-hidden />
              <Icon name="sparkle" size={13}/>
              <span>Searching LinkedIn for matching profiles…</span>
            </div>
          )}
          {showSearchMeta && !discovering && (
            <div className="related-profiles-pane__status related-profiles-pane__status--done" role="status">
              <Icon name="check" size={13}/>
              <span>Search complete</span>
              <div className="related-profiles-meta">
                {lastSearchProvider && (
                  <span className="related-profiles-meta__pill">{lastSearchProvider}</span>
                )}
                {displayLocation && (
                  <span className="related-profiles-meta__pill">{displayLocation}</span>
                )}
              </div>
            </div>
          )}
          {error && (
            <div className="related-profiles-error" role="alert">{error}</div>
          )}
        </div>
      </div>

      {loading ? (
        <RelatedProfilesLoading />
      ) : profiles.length === 0 ? (
        <div className="card related-profiles-empty">
          <div className="empty">
            <div className="related-profiles-empty__icon">
              <Icon name="search" size={22}/>
            </div>
            <div className="related-profiles-empty__title">No related profiles yet</div>
            <p className="related-profiles-empty__copy muted">
              Run <strong>Suggest profiles</strong> to discover LinkedIn candidates aligned with this job description.
            </p>
          </div>
        </div>
      ) : (
        <div className="card related-profiles-results">
          <div className="related-profiles-results__head">
            <div className="related-profiles-results__copy">
              <p className="related-profiles-results__headline">
                {buildIntroText(profiles.length, jobName, displayLocation)}
              </p>
              {showSearchMeta && (
                <p className="related-profiles-results__query muted">
                  <span className="related-profiles-results__query-label">Query</span>
                  <code className="related-profiles-results__query-code mono">{lastSearchQuery}</code>
                </p>
              )}
            </div>
            <div className="related-profiles-results__stat" aria-hidden>
              <span className="related-profiles-results__stat-val">{profiles.length}</span>
              <span className="related-profiles-results__stat-lbl">Profiles</span>
            </div>
          </div>
          <div className="related-profiles-table-wrap">
            <table className="tbl related-profiles-table">
              <thead>
                <tr>
                  <th className="col-num" style={{ width: 40 }}>#</th>
                  <th style={{ minWidth: 168 }}>Name</th>
                  <th style={{ minWidth: 160 }}>Current title</th>
                  <th style={{ minWidth: 120 }}>Company</th>
                  <th style={{ minWidth: 108 }}>Location</th>
                  <th style={{ minWidth: 220 }}>Background</th>
                  {hasScoredProfiles && <th style={{ width: 88 }}>JD fit</th>}
                  <th className="related-profiles-table__actions-col" style={{ width: 44 }}/>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p, index) => {
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
                                <Icon name="external" size={11} className="related-profiles-table__ext"/>
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
                        {bg === '—' ? <EmptyCell label="No summary" /> : bg}
                      </td>
                      {hasScoredProfiles && (
                        <td>
                          {stars != null ? (
                            <div className="related-profiles-table__stars">
                              <StarRating stars={stars}/>
                              <span className="mono muted related-profiles-table__stars-val">{stars}/5</span>
                            </div>
                          ) : (
                            <EmptyCell />
                          )}
                        </td>
                      )}
                      <td className="related-profiles-table__actions-col">
                        <IconBtn
                          className="related-profiles-row-action"
                          name="trash"
                          size={13}
                          aria-label={`Remove ${displayName}`}
                          onClick={() => removeProfile(p.id)}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
