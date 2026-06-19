// @ts-nocheck
import React from 'react'
import { Icon } from '@/caliper/ui'
import { SETTINGS_SECTIONS } from './settings-utils'

function NavLink({ section, active, onClick }) {
  return (
    <a
      href={`#${section.id}`}
      className={`settings-nav__link${active === section.id ? ' is-active' : ''}`}
      aria-current={active === section.id ? 'true' : undefined}
      onClick={(e) => {
        e.preventDefault()
        onClick(section.id)
        const el = document.getElementById(section.id)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }}
    >
      <Icon name={section.icon} size={16} aria-hidden />
      {section.label}
    </a>
  )
}

export function SettingsNav({ sections = SETTINGS_SECTIONS, active, onNavigate }) {
  const handleNavigate = onNavigate ?? ((id) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })

  return (
    <div className="settings-nav-wrap">
      <nav className="settings-nav settings-nav--mobile" aria-label="Settings sections">
        <div className="settings-nav__scroll">
          {sections.map((s) => (
            <NavLink key={s.id} section={s} active={active} onClick={handleNavigate} />
          ))}
        </div>
      </nav>
      <nav className="settings-nav settings-nav--desktop" aria-label="Settings sections">
        {sections.map((s) => (
          <NavLink key={s.id} section={s} active={active} onClick={handleNavigate} />
        ))}
      </nav>
    </div>
  )
}

export function useSettingsSectionObserver(sectionIds) {
  const [active, setActive] = React.useState(sectionIds[0] ?? '')

  React.useEffect(() => {
    if (!sectionIds.length) return undefined

    const observers = []
    const visible = new Map()

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visible.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0)
        }
        let bestId = sectionIds[0]
        let bestRatio = 0
        for (const id of sectionIds) {
          const ratio = visible.get(id) ?? 0
          if (ratio > bestRatio) {
            bestRatio = ratio
            bestId = id
          }
        }
        if (bestRatio > 0) setActive(bestId)
      },
      { rootMargin: '-20% 0px -55% 0px', threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
    )

    for (const id of sectionIds) {
      const el = document.getElementById(id)
      if (el) {
        observer.observe(el)
        observers.push(el)
      }
    }

    return () => observer.disconnect()
  }, [sectionIds])

  return active
}
