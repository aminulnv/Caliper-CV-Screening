// @ts-nocheck
import React from 'react'
import { Btn } from '@/caliper/ui'
import { formatUsd } from './settings-utils'

export function CreditsManagePopover({
  member,
  open,
  onClose,
  topUpDraft,
  onDraftChange,
  onTopUp,
  onSetUnlimited,
  saving,
}) {
  const popoverRef = React.useRef(null)
  const inputRef = React.useRef(null)

  const hasPool = member.ai_budget_usd != null
  const remaining = hasPool
    ? member.ai_remaining_usd ?? Math.max(0, member.ai_budget_usd - (member.ai_spent_usd ?? 0))
    : null
  const allocated = hasPool ? member.ai_budget_usd : null

  React.useEffect(() => {
    if (!open) return undefined
    const t = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [open])

  React.useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    const onPointer = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="credits-popover" ref={popoverRef} role="dialog" aria-label={`Manage credits for ${member.email}`}>
      <div className="credits-popover__remaining">
        <div className="credits-popover__remaining-label">Credits remaining</div>
        <div className="credits-popover__remaining-value">
          {hasPool ? formatUsd(remaining) : 'Unlimited'}
        </div>
        {hasPool && (
          <div className="credits-popover__remaining-sub">
            {formatUsd(member.ai_spent_usd ?? 0)} spent of {formatUsd(allocated)} allocated
          </div>
        )}
        {!hasPool && (
          <div className="credits-popover__remaining-sub">Pay as you go — no internal cap</div>
        )}
      </div>

      <div className="credits-popover__quick">
        <Btn size="sm" variant="ghost" disabled={saving} onClick={() => onTopUp(member, 5)}>+$5</Btn>
        <Btn size="sm" variant="ghost" disabled={saving} onClick={() => onTopUp(member, 10)}>+$10</Btn>
      </div>

      <div className="credits-popover__field">
        <label htmlFor={`credits-custom-${member.id}`}>Custom amount (USD)</label>
        <div className="credits-popover__custom">
          <input
            ref={inputRef}
            id={`credits-custom-${member.id}`}
            className="inp mono"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={topUpDraft}
            onChange={(e) => onDraftChange(e.target.value)}
            disabled={saving}
          />
          <Btn
            size="sm"
            variant="primary"
            disabled={saving || !String(topUpDraft ?? '').trim()}
            onClick={() => onTopUp(member, Number(topUpDraft))}
          >
            Add
          </Btn>
        </div>
      </div>

      {hasPool && (
        <button
          type="button"
          className="credits-popover__unlimited"
          disabled={saving}
          onClick={() => onSetUnlimited(member)}
        >
          Set unlimited
        </button>
      )}
    </div>
  )
}
