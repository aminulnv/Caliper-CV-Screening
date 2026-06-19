// @ts-nocheck
// Page 5 — Settings
import React from 'react'
import { Navigate } from 'react-router-dom'
import { Btn, Icon, PageLoading } from '@/caliper/ui'
import { api } from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import { InviteMemberModal } from '@/caliper/components/InviteMemberModal'
import { ConfirmModal } from '@/components/ConfirmModal'
import { SettingsPanel } from '@/caliper/components/settings/SettingsPanel'
import { SettingsFieldRow } from '@/caliper/components/settings/SettingsFieldRow'
import { SettingsNav, useSettingsSectionObserver } from '@/caliper/components/settings/SettingsNav'
import { SaveBanner } from '@/caliper/components/settings/SaveBanner'
import { ApiProviderSection } from '@/caliper/components/settings/ApiProviderSection'
import { TeamAccessPanel } from '@/caliper/components/settings/TeamAccessPanel'
import { SETTINGS_SECTIONS } from '@/caliper/components/settings/settings-utils'

const CONFIDENCE_OPTIONS = [
  { value: 50, label: 'Lenient · 50%' },
  { value: 60, label: 'Balanced · 60%' },
  { value: 75, label: 'Strict · 75%' },
  { value: 85, label: 'Very strict · 85%' },
]

function SettingsPage() {
  const { isAdmin } = useAuth()
  const [settings, setSettings] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [saveMsg, setSaveMsg] = React.useState(null)

  const [team, setTeam] = React.useState(null)
  const [teamLoading, setTeamLoading] = React.useState(true)
  const [teamError, setTeamError] = React.useState(null)
  const [showInvite, setShowInvite] = React.useState(false)
  const [inviting, setInviting] = React.useState(false)
  const [confirmRemove, setConfirmRemove] = React.useState(null)
  const [creditTopUpDrafts, setCreditTopUpDrafts] = React.useState({})
  const [creditSaving, setCreditSaving] = React.useState(null)

  const [anthropicKey, setAnthropicKey] = React.useState('')
  const [openaiKey, setOpenaiKey] = React.useState('')
  const [defaultModel, setDefaultModel] = React.useState('claude-sonnet-4-6')
  const [confidenceThreshold, setConfidenceThreshold] = React.useState(60)
  const [cvRetentionDays, setCvRetentionDays] = React.useState(90)
  const [evaluationRetentionDays, setEvaluationRetentionDays] = React.useState('never')

  const sectionIds = React.useMemo(() => {
    const ids = ['ai-provider', 'screening', 'team']
    if (settings?.has_recruitee_key) ids.push('integrations')
    ids.push('retention')
    return ids
  }, [settings?.has_recruitee_key])

  const navSections = React.useMemo(
    () => SETTINGS_SECTIONS.filter((s) => sectionIds.includes(s.id)),
    [sectionIds],
  )

  const activeSection = useSettingsSectionObserver(sectionIds)

  const loadTeam = React.useCallback(() => {
    setTeamLoading(true)
    setTeamError(null)
    api.workspace.listMembers()
      .then(setTeam)
      .catch((e) => setTeamError(e?.message ?? 'Failed to load team.'))
      .finally(() => setTeamLoading(false))
  }, [])

  React.useEffect(() => {
    api.settings.get()
      .then((s) => {
        setSettings(s)
        setDefaultModel(s.default_model ?? 'claude-sonnet-4-6')
        setConfidenceThreshold(s.confidence_threshold ?? 60)
        setCvRetentionDays(s.cv_retention_days ?? 90)
        setEvaluationRetentionDays(
          s.evaluation_retention_days == null ? 'never' : s.evaluation_retention_days,
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    if (isAdmin) loadTeam()
  }, [isAdmin, loadTeam])

  const save = async (body) => {
    setSaving(true)
    setSaveMsg(null)
    try {
      await api.settings.update(body)
      setSaveMsg({ ok: true, text: 'Saved.' })
      const s = await api.settings.get()
      setSettings(s)
    } catch (e) {
      setSaveMsg({ ok: false, text: e.message ?? 'Save failed.' })
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(null), 3000)
    }
  }

  if (!isAdmin) return <Navigate to="/jobs" replace />

  if (loading) {
    return (
      <div className="page settings-page">
        <div className="settings-panel">
          <PageLoading title="Loading settings" message="Fetching workspace configuration…" />
        </div>
      </div>
    )
  }

  const supportedModels = settings?.supported_models ?? [
    'claude-sonnet-4-6',
    'claude-opus-4-7',
    'claude-haiku-4-5-20251001',
    'gpt-4o',
    'gpt-4o-mini',
  ]

  const handleInvite = async ({ email, role }) => {
    setInviting(true)
    try {
      await api.workspace.invite({ email, role })
      loadTeam()
    } finally {
      setInviting(false)
    }
  }

  const handleRoleChange = async (memberId, role) => {
    try {
      await api.workspace.updateMemberRole(memberId, role)
      loadTeam()
    } catch (e) {
      setTeamError(e?.message ?? 'Could not update role.')
    }
  }

  const handleTopUp = async (member, amountUsd) => {
    const amount = Number(amountUsd)
    if (!Number.isFinite(amount) || amount <= 0) {
      setTeamError('Credit amount must be a positive number.')
      return
    }
    setCreditSaving(member.id)
    setTeamError(null)
    try {
      await api.workspace.topUpMemberCredits(member.id, amount)
      loadTeam()
      setCreditTopUpDrafts((prev) => {
        const next = { ...prev }
        delete next[member.id]
        return next
      })
    } catch (e) {
      setTeamError(e?.message ?? 'Could not add credits.')
    } finally {
      setCreditSaving(null)
    }
  }

  const handleSetUnlimited = async (member) => {
    setCreditSaving(member.id)
    setTeamError(null)
    try {
      await api.workspace.setMemberCreditsUnlimited(member.id)
      loadTeam()
    } catch (e) {
      setTeamError(e?.message ?? 'Could not set unlimited credits.')
    } finally {
      setCreditSaving(null)
    }
  }

  const handleRemove = async () => {
    if (!confirmRemove) return
    try {
      if (confirmRemove.type === 'member') {
        await api.workspace.removeMember(confirmRemove.id)
      } else {
        await api.workspace.revokeInvite(confirmRemove.id)
      }
      setConfirmRemove(null)
      loadTeam()
    } catch (e) {
      setTeamError(e?.message ?? 'Could not remove.')
      setConfirmRemove(null)
    }
  }

  const confidenceLabel = CONFIDENCE_OPTIONS.find((o) => o.value === confidenceThreshold)?.label

  return (
    <div className="page settings-page">
      <header className="settings-page__header">
        <p className="page__eyebrow">Workspace</p>
        <h1 className="page__title" style={{ marginBottom: 6 }}>Settings</h1>
        <p className="page__sub">
          Manage API keys, screening defaults, team access, and AI credit pools for this workspace.
        </p>
      </header>

      <SaveBanner message={saveMsg} />

      <div className="settings-page__layout">
        <SettingsNav sections={navSections} active={activeSection} />

        <main className="settings-page__main">
          <SettingsPanel
            id="ai-provider"
            icon="sparkle"
            title="AI provider"
            sub="Workspace API keys are encrypted at rest and never exposed to the browser after saving."
          >
            <ApiProviderSection
              settings={settings}
              defaultModel={defaultModel}
              onDefaultModelChange={setDefaultModel}
              anthropicKey={anthropicKey}
              onAnthropicKeyChange={setAnthropicKey}
              openaiKey={openaiKey}
              onOpenaiKeyChange={setOpenaiKey}
              supportedModels={supportedModels}
              saving={saving}
              onSaveModel={() => save({ default_model: defaultModel })}
              onSaveAnthropicKey={() => {
                save({ anthropic_key: anthropicKey })
                setAnthropicKey('')
              }}
              onSaveOpenaiKey={() => {
                save({ openai_key: openaiKey })
                setOpenaiKey('')
              }}
            />
          </SettingsPanel>

          <SettingsPanel
            id="screening"
            icon="sliders"
            title="Screening defaults"
            sub="Apply across every new screening run."
          >
            <SettingsFieldRow
              label="Minimum confidence"
              hint="Below this, a criterion match is flagged for manual review."
            >
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <select
                  className="sel"
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
                  style={{ minWidth: 180 }}
                  aria-label="Minimum confidence threshold"
                >
                  {CONFIDENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <Btn
                  variant="ghost"
                  disabled={saving}
                  onClick={() => save({ confidence_threshold: confidenceThreshold })}
                >
                  Save
                </Btn>
              </div>
            </SettingsFieldRow>
            {confidenceLabel && (
              <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                Current: <strong>{confidenceLabel}</strong>
              </p>
            )}
          </SettingsPanel>

          <SettingsPanel
            id="team"
            icon="users"
            title="Team & credits"
            sub="Editors run screenings. Viewers see results only. Add AI credits when someone runs out, or set unlimited pay-as-you-go."
            flush
          >
            <TeamAccessPanel
              team={team}
              teamLoading={teamLoading}
              teamError={teamError}
              topUpDrafts={creditTopUpDrafts}
              creditSaving={creditSaving}
              onInviteClick={() => setShowInvite(true)}
              onRoleChange={handleRoleChange}
              onTopUpDraftChange={(id, value) => setCreditTopUpDrafts((prev) => ({ ...prev, [id]: value }))}
              onTopUp={handleTopUp}
              onSetUnlimited={handleSetUnlimited}
              onRemoveMember={setConfirmRemove}
              onRevokeInvite={setConfirmRemove}
            />
          </SettingsPanel>

          <InviteMemberModal
            open={showInvite}
            onClose={() => setShowInvite(false)}
            onInvite={handleInvite}
            inviting={inviting}
          />

          <ConfirmModal
            open={Boolean(confirmRemove)}
            onClose={() => setConfirmRemove(null)}
            onConfirm={handleRemove}
            title={confirmRemove?.type === 'invite' ? 'Revoke invite?' : 'Remove member?'}
            message={
              confirmRemove
                ? `${confirmRemove.label} will lose access to this workspace.`
                : undefined
            }
            confirmLabel={confirmRemove?.type === 'invite' ? 'Revoke' : 'Remove'}
            variant="danger"
          />

          {settings?.has_recruitee_key && (
            <SettingsPanel
              id="integrations"
              icon="database"
              title="Integrations"
              sub="Recruitee is connected via a platform-managed API token."
            >
              <div className="settings-integration-callout">
                <div className="settings-integration-callout__icon" aria-hidden>
                  <Icon name="database" size={20} />
                </div>
                <p style={{ margin: 0 }}>
                  Pipeline pushes from screening results update Recruitee using the shared integration token.
                  Recruitee audit logs will show{' '}
                  <strong>{settings.recruitee_platform_actor_label ?? 'the platform integration account'}</strong>,
                  not the Caliper user who clicked. Caliper always records who made each disposition decision.
                </p>
              </div>
            </SettingsPanel>
          )}

          <SettingsPanel
            id="retention"
            icon="history"
            title="Data retention"
            sub="Uploaded CV files and old screening runs are purged automatically. Recruitee CVs are never stored in Caliper."
            footer={
              <Btn
                variant="primary"
                disabled={saving}
                onClick={() => save({
                  cv_retention_days: cvRetentionDays,
                  evaluation_retention_days: evaluationRetentionDays === 'never' ? null : evaluationRetentionDays,
                })}
              >
                Save retention
              </Btn>
            }
          >
            <SettingsFieldRow label="CV files" hint="Uploaded PDFs in S3 only — not Recruitee.">
              <select
                className="sel"
                style={{ minWidth: 160 }}
                value={cvRetentionDays}
                onChange={(e) => setCvRetentionDays(Number(e.target.value))}
                aria-label="CV file retention"
              >
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
                <option value={365}>1 year</option>
              </select>
            </SettingsFieldRow>
            <SettingsFieldRow label="Evaluation results" hint="Scores, quotes, and run history.">
              <select
                className="sel"
                style={{ minWidth: 160 }}
                value={evaluationRetentionDays === 'never' ? 'never' : evaluationRetentionDays}
                onChange={(e) => {
                  const v = e.target.value
                  setEvaluationRetentionDays(v === 'never' ? 'never' : Number(v))
                }}
                aria-label="Evaluation retention"
              >
                <option value={180}>180 days</option>
                <option value={365}>1 year</option>
                <option value={730}>2 years</option>
                <option value="never">Indefinite</option>
              </select>
            </SettingsFieldRow>
            <SettingsFieldRow
              label="Recruiter overrides"
              hint="Runs with an override are kept until you delete them manually."
            >
              <span className="mono muted" style={{ fontSize: 13 }}>Audit-protected · not auto-deleted</span>
            </SettingsFieldRow>
          </SettingsPanel>
        </main>
      </div>
    </div>
  )
}

export default SettingsPage
