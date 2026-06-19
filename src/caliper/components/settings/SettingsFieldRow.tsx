// @ts-nocheck
import React from 'react'
import { Icon } from '@/caliper/ui'

export function SettingsFieldRow({ label, hint, children }) {
  return (
    <div className="settings-field-row">
      <div className="settings-field-row__label">
        <div className="settings-field-row__lbl">{label}</div>
        {hint && <div className="settings-field-row__hint">{hint}</div>}
      </div>
      <div className="settings-field-row__control">{children}</div>
    </div>
  )
}
