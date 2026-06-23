// @ts-nocheck
import React from 'react'
import { Btn, Icon, IconBtn } from '@/caliper/ui'
import type { RelatedProfileRow } from '@/services/api'
import {
  displayBackground,
  displayCompany,
  displayLocation,
  displayTitle,
} from '@/lib/linkedin-profile-display'

function profileField(profile: RelatedProfileRow, snake: string, camel: string) {
  return profile[snake] ?? profile[camel] ?? null
}

function displayProfileName(name: string, linkedinUrl: string | null): string {
  if (!/\s[0-9a-f]{6,}$/i.test(name)) return name
  if (!linkedinUrl) return name.replace(/\s+[0-9a-f]{6,}$/i, '')
  const match = linkedinUrl.match(/\/in\/([^/?#]+)/i)
  if (!match) return name.replace(/\s+[0-9a-f]{6,}$/i, '')
  const slug = match[1].replace(/-[0-9a-f]{6,}$/i, '')
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function StarRating({ stars, max = 5, size = 14 }) {
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
      <span className="related-profiles-detail__stars-val mono">{stars}/{max}</span>
    </span>
  )
}

export function RelatedProfileDetailSheet({
  profile,
  jobName,
  onClose,
  canEdit,
  onRemove,
}) {
  React.useEffect(() => {
    if (!profile) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [profile, onClose])

  if (!profile) return null

  const linkedinUrl = profileField(profile, 'linkedin_url', 'linkedinUrl')
  const displayName = displayProfileName(profile.name, linkedinUrl)
  const headline = profileField(profile, 'headline', 'headline')
  const title = profileField(profile, 'title', 'title')
  const summary = profileField(profile, 'profile_summary', 'profileSummary')
  const currentTitle = displayTitle(headline, title, summary, jobName)
  const company = displayCompany(profileField(profile, 'company', 'company'), summary, headline)
  const location = displayLocation(profileField(profile, 'location', 'location'), summary)
  const rationale = profileField(profile, 'alignment_rationale', 'alignmentRationale')
  const stars = profileField(profile, 'alignment_stars', 'alignmentStars')
  const background = rationale || displayBackground(summary)

  return (
    <div className="related-profiles-detail" onClick={onClose} role="presentation">
      <div
        className="related-profiles-detail__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="related-profile-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="related-profiles-detail__head">
          <div className="related-profiles-detail__head-main">
            <h2 id="related-profile-detail-title" className="related-profiles-detail__title">
              {displayName}
            </h2>
            {currentTitle && (
              <p className="related-profiles-detail__subtitle muted">{currentTitle}</p>
            )}
            <div className="related-profiles-detail__meta">
              {company && <span>{company}</span>}
              {company && location && <span aria-hidden>·</span>}
              {location && <span>{location}</span>}
            </div>
            {stars != null && (
              <div className="related-profiles-detail__fit">
                <span className="related-profiles-detail__fit-label">JD fit</span>
                <StarRating stars={stars} />
              </div>
            )}
          </div>
          <IconBtn
            name="x"
            size={18}
            onClick={onClose}
            aria-label="Close profile details"
            className="related-profiles-detail__close"
          />
        </header>

        <div className="related-profiles-detail__body">
          <section className="related-profiles-detail__section">
            <h3 className="related-profiles-detail__section-title">Background</h3>
            <p className="related-profiles-detail__text">
              {background && background !== '—' ? background : 'No summary available for this profile.'}
            </p>
          </section>
          {rationale && summary && rationale !== summary && (
            <section className="related-profiles-detail__section">
              <h3 className="related-profiles-detail__section-title">Profile summary</h3>
              <p className="related-profiles-detail__text">{displayBackground(summary)}</p>
            </section>
          )}
          {stars != null && rationale && (
            <section className="related-profiles-detail__section">
              <h3 className="related-profiles-detail__section-title">JD fit rationale</h3>
              <p className="related-profiles-detail__text">{rationale}</p>
            </section>
          )}
        </div>

        <footer className="related-profiles-detail__foot">
          {linkedinUrl && (
            <Btn
              variant="default"
              icon="external"
              size="sm"
              onClick={() => window.open(linkedinUrl, '_blank', 'noopener,noreferrer')}
            >
              Open LinkedIn
            </Btn>
          )}
          {canEdit && onRemove && (
            <Btn
              variant="ghost"
              icon="trash"
              size="sm"
              onClick={() => {
                onRemove(profile)
                onClose()
              }}
            >
              Remove from list
            </Btn>
          )}
          <div className="spacer" />
          <Btn variant="ghost" size="sm" onClick={onClose}>Close</Btn>
        </footer>
      </div>
    </div>
  )
}
