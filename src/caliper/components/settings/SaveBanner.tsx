// @ts-nocheck
import React from 'react'
import { Icon } from '@/caliper/ui'

export function SaveBanner({ message }) {
  if (!message) return null
  return (
    <div
      className={`settings-save-banner settings-save-banner--${message.ok ? 'ok' : 'bad'}`}
      role="status"
      aria-live="polite"
    >
      <Icon name={message.ok ? 'check' : 'alert'} size={16} aria-hidden />
      {message.text}
    </div>
  )
}
