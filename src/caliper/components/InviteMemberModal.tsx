// @ts-nocheck
import React from 'react'
import { Btn, Field } from '@/caliper/ui'
import type { UserRole } from '@/services/api'
import { labelForRole } from '@/lib/roles'

const ROLE_OPTIONS: UserRole[] = ['viewer', 'recruiter', 'admin']

export function InviteMemberModal({ open, onClose, onInvite, inviting }) {
  const [email, setEmail] = React.useState('')
  const [role, setRole] = React.useState('viewer')
  const [error, setError] = React.useState(null)

  React.useEffect(() => {
    if (open) {
      setEmail('')
      setRole('viewer')
      setError(null)
    }
  }, [open])

  if (!open) return null

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      await onInvite({ email: email.trim(), role })
      onClose()
    } catch (err) {
      setError(err?.message ?? 'Could not send invite.')
    }
  }

  return (
    <div className="invite-modal" role="dialog" aria-modal="true" aria-labelledby="invite-modal-title">
      <button type="button" className="invite-modal__backdrop" aria-label="Close" onClick={onClose} />
      <form className="invite-modal__panel" onSubmit={submit}>
        <h2 id="invite-modal-title" className="invite-modal__title">Invite member</h2>
        <p className="invite-modal__sub muted">
          They&apos;ll get access when they sign in with Google using this email. No invite email is sent.
        </p>

        <Field label="Email address">
          <input
            className="inp"
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            required
          />
        </Field>

        <Field label="Role" hint="Editors can manage jobs and runs. Viewers can only view results.">
          <select className="sel" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>{labelForRole(r)}</option>
            ))}
          </select>
        </Field>

        {error && (
          <p className="invite-modal__error" role="alert">{error}</p>
        )}

        <div className="invite-modal__actions">
          <Btn type="button" variant="ghost" onClick={onClose} disabled={inviting}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={inviting || !email.trim()}>
            {inviting ? 'Inviting…' : 'Invite'}
          </Btn>
        </div>
      </form>
    </div>
  )
}
