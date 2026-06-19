// @ts-nocheck
import React from 'react'
import { Btn, Badge, IconBtn, Icon } from '@/caliper/ui'
import { labelForRole } from '@/lib/roles'
import { creditsStatusLabel } from '@/lib/credits-display'
import { CreditsManagePopover } from './CreditsManagePopover'
import {
  formatJoined,
  formatUsd,
  memberInitials,
  statusTone,
  memberRemaining,
  computeTeamKpis,
} from './settings-utils'

function MemberAvatar({ name, email, avatarUrl, pending = false }) {
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => { setFailed(false) }, [avatarUrl])
  const showImage = Boolean(avatarUrl) && !failed
  return (
    <span className={`team-member__avatar${pending ? ' team-member__avatar--pending' : ''}`}>
      {showImage
        ? <img src={avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : memberInitials(name, email)}
    </span>
  )
}

function TeamRoleSelect({ value, onChange, email, disabled = false }) {
  return (
    <select
      className="sel team-role-select"
      value={value}
      onChange={onChange}
      disabled={disabled}
      aria-label={`Role for ${email}`}
    >
      <option value="viewer">{labelForRole('viewer')}</option>
      <option value="recruiter">{labelForRole('recruiter')}</option>
      <option value="admin">{labelForRole('admin')}</option>
    </select>
  )
}

function SettingsKpi({ label, value, icon, tone }) {
  return (
    <div className={`settings-kpi settings-kpi--${tone}`}>
      <div className="settings-kpi__icon" aria-hidden>
        <Icon name={icon} size={18} />
      </div>
      <div>
        <div className="settings-kpi__label">{label}</div>
        <div className="settings-kpi__value">{value}</div>
      </div>
    </div>
  )
}

function CreditsSummaryCell({
  member,
  open,
  onToggle,
  topUpDraft,
  onDraftChange,
  onTopUp,
  onSetUnlimited,
  saving,
}) {
  if (member.role === 'viewer') {
    return <span className="team-cell__na">Not applicable</span>
  }

  const hasPool = member.ai_budget_usd != null
  const remaining = memberRemaining(member)
  const allocated = hasPool ? formatUsd(member.ai_budget_usd) : 'Unlimited'
  const remainingFmt = hasPool ? formatUsd(remaining) : '—'

  return (
    <div className="settings-credits-cell">
      <div className="settings-credits-cell__amounts">
        <span><span className="settings-credits-cell__label">Alloc </span>{allocated}</span>
        <span><span className="settings-credits-cell__label">Left </span>{remainingFmt}</span>
      </div>
      <Badge tone={statusTone(member.ai_status)} dot={member.ai_status !== 'unlimited'}>
        {creditsStatusLabel(member.ai_status)}
      </Badge>
      <div className="settings-credits-manage-wrap">
        <Btn
          size="sm"
          variant="ghost"
          aria-expanded={open}
          onClick={onToggle}
          disabled={saving}
        >
          Manage
        </Btn>
        {open && (
          <CreditsManagePopover
            member={member}
            open
            onClose={onToggle}
            topUpDraft={topUpDraft}
            onDraftChange={onDraftChange}
            onTopUp={onTopUp}
            onSetUnlimited={onSetUnlimited}
            saving={saving}
          />
        )}
      </div>
    </div>
  )
}

export function TeamAccessPanel({
  team,
  teamLoading,
  teamError,
  topUpDrafts,
  creditSaving,
  onInviteClick,
  onRoleChange,
  onTopUpDraftChange,
  onTopUp,
  onSetUnlimited,
  onRemoveMember,
  onRevokeInvite,
}) {
  const members = team?.members ?? []
  const pending = team?.pending_invites ?? []
  const isEmpty = !members.length && !pending.length
  const [openCreditsId, setOpenCreditsId] = React.useState(null)

  const kpis = computeTeamKpis(members)

  return (
    <>
      {!teamLoading && members.length > 0 && (
        <div className="settings-kpi-grid" style={{ padding: '20px 22px 0' }}>
          <SettingsKpi
            label="Seats"
            value={team?.seats ? `${team.seats.used} / ${team.seats.max}` : '—'}
            icon="users"
            tone="brand"
          />
          <SettingsKpi
            label="Team spent"
            value={formatUsd(kpis.totalSpent)}
            icon="sparkle"
            tone="violet"
          />
          <SettingsKpi
            label="Credits allocated"
            value={formatUsd(kpis.totalAllocated)}
            icon="shield"
            tone="info"
          />
          <SettingsKpi
            label="Blocked members"
            value={String(kpis.blockedCount)}
            icon="alert"
            tone={kpis.blockedCount > 0 ? 'bad' : 'ok'}
          />
        </div>
      )}

      <div className="settings-team-toolbar">
        <div className="team-panel__meta">
          {team?.seats && (
            <span className="team-panel__seats">
              {team.seats.used} of {team.seats.max} seats
            </span>
          )}
          <span className="team-panel__hint muted">
            {members.length} active{pending.length > 0 ? ` · ${pending.length} pending` : ''}
          </span>
        </div>
        <Btn icon="plus" variant="primary" size="sm" onClick={onInviteClick}>
          Invite member
        </Btn>
      </div>

      {teamError && (
        <div className="team-panel__error" role="alert" style={{ margin: '0 22px 16px' }}>{teamError}</div>
      )}

      {teamLoading ? (
        <div className="settings-team-empty muted">Loading team…</div>
      ) : isEmpty ? (
        <div className="settings-team-empty">
          <p className="settings-team-empty__title">No members yet</p>
          <p className="settings-team-empty__sub muted">
            Invite colleagues to share screening runs and job profiles.
          </p>
          <Btn icon="plus" variant="primary" size="sm" onClick={onInviteClick}>Invite member</Btn>
        </div>
      ) : (
        <div className="settings-team-scroll">
          <table className="settings-team-tbl">
            <thead>
              <tr>
                <th>Member</th>
                <th style={{ width: 120 }}>Role</th>
                <th style={{ width: 200 }}>Credits</th>
                <th style={{ width: 96 }} className="col-right">Spent</th>
                <th style={{ width: 88 }}>Joined</th>
                <th style={{ width: 48 }}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const spentClass = m.ai_status === 'blocked'
                  ? 'settings-team-spent--bad'
                  : m.ai_status === 'warn'
                    ? 'settings-team-spent--warn'
                    : ''
                return (
                  <tr key={m.id}>
                    <td>
                      <div className="settings-team-member">
                        <MemberAvatar name={m.name} email={m.email} avatarUrl={m.avatar_url} />
                        <div>
                          <div className="settings-team-member__name">
                            {m.name || m.email}
                            {m.is_current_user && <span className="settings-team-member__you">You</span>}
                          </div>
                          {m.name && <div className="settings-team-member__email">{m.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <TeamRoleSelect
                        value={m.role}
                        email={m.email}
                        onChange={(e) => onRoleChange(m.id, e.target.value)}
                      />
                    </td>
                    <td>
                      <CreditsSummaryCell
                        member={m}
                        open={openCreditsId === m.id}
                        onToggle={() => setOpenCreditsId(openCreditsId === m.id ? null : m.id)}
                        topUpDraft={topUpDrafts[m.id] ?? ''}
                        onDraftChange={(v) => onTopUpDraftChange(m.id, v)}
                        onTopUp={(member, amount) => {
                          onTopUp(member, amount)
                          setOpenCreditsId(null)
                        }}
                        onSetUnlimited={(member) => {
                          onSetUnlimited(member)
                          setOpenCreditsId(null)
                        }}
                        saving={creditSaving === m.id}
                      />
                    </td>
                    <td className={`col-right settings-team-spent ${spentClass}`}>
                      {m.role === 'viewer' ? '—' : formatUsd(m.ai_spent_usd ?? 0)}
                    </td>
                    <td className="settings-team-joined">{formatJoined(m.joined_at)}</td>
                    <td>
                      <IconBtn
                        name="trash"
                        title="Remove member"
                        onClick={() => onRemoveMember({ type: 'member', id: m.id, label: m.name || m.email })}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!teamLoading && pending.length > 0 && (
        <div className="settings-team-pending">
          <div className="settings-team-pending__title">Pending invitations</div>
          <div className="settings-team-scroll">
            <table className="settings-team-tbl">
              <tbody>
                {pending.map((inv) => (
                  <tr key={inv.id} className="team-row--pending">
                    <td>
                      <div className="settings-team-member">
                        <MemberAvatar name={null} email={inv.email} pending />
                        <div>
                          <div className="settings-team-member__name">{inv.email}</div>
                          <Badge tone="info">Pending</Badge>
                        </div>
                      </div>
                    </td>
                    <td><span className="team-role-readonly">{labelForRole(inv.role)}</span></td>
                    <td><span className="team-cell__na">—</span></td>
                    <td className="col-right">—</td>
                    <td className="settings-team-joined">{formatJoined(inv.invited_at)}</td>
                    <td>
                      <IconBtn
                        name="trash"
                        title="Revoke invite"
                        onClick={() => onRevokeInvite({ type: 'invite', id: inv.id, label: inv.email })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
