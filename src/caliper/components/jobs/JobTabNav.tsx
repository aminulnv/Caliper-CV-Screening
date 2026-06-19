// @ts-nocheck
import React from 'react'
import { Icon } from '@/caliper/ui'

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'doc' },
  { id: 'criteria', label: 'Criteria', icon: 'sliders' },
  { id: 'runs', label: 'Runs', icon: 'history' },
  { id: 'candidates', label: 'Applicants', icon: 'users' },
  { id: 'related', label: 'Talent', icon: 'search' },
  { id: 'audit', label: 'Activity', icon: 'list' },
]

export function JobTabNav({ activeTab, onTabChange, counts = {} }) {
  return (
    <nav className="job-tab-nav" aria-label="Job sections">
      <div className="job-tab-nav__scroll">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className="job-tab-btn"
            onClick={() => onTabChange(tab.id)}
          >
            <Icon name={tab.icon} size={14} aria-hidden />
            {tab.label}
            {counts[tab.id] != null && (
              <span className="job-tab-btn__count">{counts[tab.id]}</span>
            )}
          </button>
        ))}
      </div>
    </nav>
  )
}
