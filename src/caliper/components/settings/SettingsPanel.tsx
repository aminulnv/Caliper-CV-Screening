// @ts-nocheck
import React from 'react'
import { Icon } from '@/caliper/ui'

export function SettingsPanel({
  id,
  icon,
  title,
  sub,
  actions,
  children,
  flush = false,
  footer,
}) {
  return (
    <section id={id} className="settings-panel" aria-labelledby={`${id}-heading`}>
      <div className="settings-panel__head">
        {icon && (
          <div className="settings-panel__icon" aria-hidden>
            <Icon name={icon} size={20} />
          </div>
        )}
        <div className="settings-panel__title-wrap">
          <h2 id={`${id}-heading`} className="settings-panel__title">{title}</h2>
          {sub && <p className="settings-panel__sub">{sub}</p>}
        </div>
        {actions && <div className="settings-panel__actions">{actions}</div>}
      </div>
      <div className={`settings-panel__body${flush ? ' settings-panel__body--flush' : ''}`}>
        {children}
      </div>
      {footer && <div className="settings-panel__footer">{footer}</div>}
    </section>
  )
}
