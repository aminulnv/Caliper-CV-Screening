// @ts-nocheck
import React from 'react'
import { Btn, Icon, CriterionWeightBar } from '@/caliper/ui'
import { JobsPanel } from '@/caliper/components/jobs/JobsPanel'
import { getBiasWarning, getProtectedAttributeError } from '@/lib/criteria-validation'

export function newCriterionId() {
  return `crit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

const stepBtnStyle = {
  width: 14, height: 14, padding: 0, display: 'grid', placeItems: 'center',
  background: 'transparent', border: 0, color: 'var(--muted)', cursor: 'pointer',
  fontSize: 11, lineHeight: 1,
}

const WeightStepper = ({ value, onChange, disabled = false }) => (
  <span className="chip__w" style={{ padding: 0, gap: 2, opacity: disabled ? 0.55 : 1 }}>
    <button type="button" disabled={disabled} className="focus-ring" onClick={() => onChange(Math.max(1, value - 1))} style={stepBtnStyle}>−</button>
    <span style={{ padding: '0 4px' }}>×{value}</span>
    <button type="button" disabled={disabled} className="focus-ring" onClick={() => onChange(Math.min(5, value + 1))} style={stepBtnStyle}>+</button>
  </span>
)

export function CriteriaList({
  kind,
  label,
  help,
  items,
  setItems,
  onBiasWarn,
  canEdit = true,
  calibrationByCriterionId,
  wrapPanelClass = '',
}) {
  const [input, setInput] = React.useState('')
  const [weight, setWeight] = React.useState(kind === 'must' ? 5 : 3)
  const [inputError, setInputError] = React.useState('')
  const [renameErrors, setRenameErrors] = React.useState({})
  const focusNamesRef = React.useRef({})

  const draftText = input.trim()
  const hasDraft = draftText.length > 0

  const add = () => {
    const name = input.trim()
    if (!name) return
    const blocked = getProtectedAttributeError(name)
    if (blocked) {
      setInputError(blocked)
      return
    }
    setInputError('')
    if (getBiasWarning(name) && onBiasWarn) {
      onBiasWarn({ name, weight })
      setInput('')
      return
    }
    setItems([...items, { id: newCriterionId(), name, weight }])
    setInput('')
  }
  const remove = (id) => setItems(items.filter((x) => x.id !== id))
  const setWeightFor = (id, w) => setItems(items.map((x) => (x.id === id ? { ...x, weight: w } : x)))
  const renameItem = (id, name) => {
    setRenameErrors((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setItems(items.map((x) => (x.id === id ? { ...x, name } : x)))
  }
  const commitRename = (id, rawName) => {
    const trimmed = rawName.trim()
    const fallback = focusNamesRef.current[id] ?? items.find((x) => x.id === id)?.name ?? ''
    if (!trimmed) {
      renameItem(id, fallback)
      return
    }
    const blocked = getProtectedAttributeError(trimmed)
    if (blocked) {
      setRenameErrors((prev) => ({ ...prev, [id]: blocked }))
      renameItem(id, fallback)
      return
    }
    const biased = getBiasWarning(trimmed)
    setItems(items.map((x) => (x.id === id ? { ...x, name: trimmed, ...(biased ? { biased: true } : {}) } : x)))
  }

  return (
    <JobsPanel flush className={wrapPanelClass}>
      <div className="crit-list">
        {canEdit && hasDraft && (
          <div className="callout" style={{ marginBottom: 10, fontSize: 12.5 }}>
            You have unsaved text in the box below. Click <strong>+ Add</strong>, then{' '}
            <strong>Save criteria &amp; model</strong> — typing alone does not add a criterion.
          </div>
        )}
        <div className="crit-list__hd">
          <div className="crit-list__title">
            <span className={`crit-list__kind-icon crit-list__kind-icon--${kind}`} aria-hidden>
              <Icon name={kind === 'must' ? 'check' : kind === 'nice' ? 'thumb-up' : 'flag'} size={11} />
            </span>
            {label}
          </div>
          <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>· {help}</span>
          <span className="crit-list__count">{items.length} criteria</span>
        </div>
        <div className="crit-list__body">
          <div className="crit-list__chips">
            {items.length === 0
              ? <span className="muted" style={{ fontSize: 12, padding: '6px 2px' }}>No criteria yet — add one below.</span>
              : items.map((it) => (
                <React.Fragment key={it.id}>
                  <span className={`chip chip--${kind}`}>
                    {canEdit ? (
                      <input
                        className="chip__crit-name chip__crit-name--input"
                        value={it.name}
                        aria-label={`Edit criterion: ${it.name}`}
                        onFocus={() => { focusNamesRef.current[it.id] = it.name }}
                        onChange={(e) => renameItem(it.id, e.target.value)}
                        onBlur={(e) => commitRename(it.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                      />
                    ) : (
                      <span className="chip__crit-name">{it.name}</span>
                    )}
                    {renameErrors[it.id] && (
                      <span style={{ flex: '1 1 100%', fontSize: 11, color: 'var(--bad)', lineHeight: 1.35 }}>
                        {renameErrors[it.id]}
                      </span>
                    )}
                    <span className="chip__crit-actions">
                      <span className="chip__weight-wrap">
                        <CriterionWeightBar weight={it.weight} kind={kind} />
                        <WeightStepper value={it.weight} onChange={(w) => setWeightFor(it.id, w)} disabled={!canEdit} />
                      </span>
                      {canEdit && (
                        <button type="button" className="chip__x focus-ring" onClick={() => remove(it.id)} aria-label={`Remove ${it.name}`}>
                          <Icon name="x" size={10} stroke={2} />
                        </button>
                      )}
                    </span>
                  </span>
                  {(it.biased || getBiasWarning(it.name)) && (
                    <div className="criterion-bias-callout" role="note">
                      <Icon name="alert" size={12} aria-hidden />
                      <span>
                        This criterion may introduce bias — review wording to focus on job-relevant skills, not protected attributes.
                      </span>
                    </div>
                  )}
                  {calibrationByCriterionId?.get(it.id) && (
                    <span className="calibration-chip-hint">
                      {Math.round(calibrationByCriterionId.get(it.id).override_rate * 100)}% override rate · consider rewording
                    </span>
                  )}
                </React.Fragment>
              ))}
          </div>
          {canEdit && (
            <>
              <div className="crit-list__add">
                <input
                  className="inp"
                  placeholder={`Add a ${kind === 'must' ? 'must-have' : kind === 'nice' ? 'nice-to-have' : 'red flag'} criterion…`}
                  value={input}
                  onChange={(e) => { setInput(e.target.value); if (inputError) setInputError('') }}
                  onKeyDown={(e) => e.key === 'Enter' && add()}
                  style={{ flex: 1 }}
                />
                <div className="row" style={{ gap: 4 }}>
                  <CriterionWeightBar weight={weight} kind={kind} />
                  <span className="mono muted" style={{ fontSize: 11 }}>weight</span>
                  <WeightStepper value={weight} onChange={setWeight} />
                </div>
                <Btn icon="plus" onClick={add}>Add</Btn>
              </div>
              {inputError && (
                <p style={{ fontSize: 12, color: 'var(--bad)', margin: '8px 0 0' }}>{inputError}</p>
              )}
            </>
          )}
        </div>
      </div>
    </JobsPanel>
  )
}
