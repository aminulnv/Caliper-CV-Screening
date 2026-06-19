// @ts-nocheck
import React from 'react'
import { Icon } from '@/caliper/ui'

export function JobsPanel({ icon, title, sub, actions, children, flush = false, footer, className = '' }) {
  return (
    <section className={`jobs-panel${flush ? ' jobs-panel--flush' : ''} ${className}`.trim()}>
      {(title || sub) && (
        <div className="jobs-panel__head">
          {icon && (
            <div className="jobs-panel__icon" aria-hidden>
              <Icon name={icon} size={18} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {title && <h2 className="jobs-panel__title">{title}</h2>}
            {sub && <p className="jobs-panel__sub">{sub}</p>}
          </div>
          {actions && <div>{actions}</div>}
        </div>
      )}
      <div className="jobs-panel__body">{children}</div>
      {footer && <div className="jobs-panel__footer">{footer}</div>}
    </section>
  )
}
