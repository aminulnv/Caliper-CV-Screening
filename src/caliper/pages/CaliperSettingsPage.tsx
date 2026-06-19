// @ts-nocheck
// Page 5 — Settings
import React from 'react'
import { Navigate } from 'react-router-dom'
import { Btn, Badge, Field, Toggle, IconBtn } from '@/caliper/ui'
import { api } from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import { InviteMemberModal } from '@/caliper/components/InviteMemberModal'
import { ConfirmModal } from '@/components/ConfirmModal'
import { labelForRole } from '@/lib/roles'

const CONFIDENCE_OPTIONS = [
  { value: 50, label: 'Lenient · 50%' },
  { value: 60, label: 'Balanced · 60%' },
  { value: 75, label: 'Strict · 75%' },
  { value: 85, label: 'Very strict · 85%' },
];

function memberInitials(name, email) {
  if (name?.trim()) {
    return name.trim().split(/\s+/).map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  }
  return (email?.[0] ?? '?').toUpperCase();
}

function MemberAvatar({ name, email, avatarUrl, pending = false }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => { setFailed(false); }, [avatarUrl]);
  const showImage = Boolean(avatarUrl) && !failed;
  return (
    <span className={`team-member__avatar${pending ? ' team-member__avatar--pending' : ''}`}>
      {showImage
        ? <img src={avatarUrl} alt="" referrerPolicy="no-referrer"
            onError={() => setFailed(true)} />
        : memberInitials(name, email)}
    </span>
  );
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
  );
}

function TeamBudgetField({ member, budgetDrafts, budgetSaving, onDraftChange, onSave }) {
  if (member.role === 'viewer') {
    return <span className="team-cell__na">Not applicable</span>;
  }
  return (
    <div className="team-budget">
      <span className="team-budget__prefix" aria-hidden>$</span>
      <input
        className="inp team-budget__input mono"
        type="number"
        min="0"
        step="0.01"
        placeholder="Unlimited"
        value={budgetDrafts[member.id] !== undefined ? budgetDrafts[member.id] : (member.ai_budget_usd ?? '')}
        onChange={(e) => onDraftChange(member.id, e.target.value)}
        onBlur={() => onSave(member)}
        disabled={budgetSaving === member.id}
        aria-label={`AI budget for ${member.email}`}
      />
    </div>
  );
}

function TeamAccessPanel({
  team,
  teamLoading,
  teamError,
  budgetDrafts,
  budgetSaving,
  onInviteClick,
  onRoleChange,
  onBudgetDraftChange,
  onBudgetSave,
  onRemoveMember,
  onRevokeInvite,
}) {
  const members = team?.members ?? [];
  const pending = team?.pending_invites ?? [];
  const isEmpty = !members.length && !pending.length;

  return (
    <div className="team-panel">
      <div className="team-panel__toolbar">
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
        <div className="team-panel__error" role="alert">{teamError}</div>
      )}

      {teamLoading ? (
        <div className="team-panel__empty muted">Loading team…</div>
      ) : isEmpty ? (
        <div className="team-panel__empty">
          <p className="team-panel__empty-title">No members yet</p>
          <p className="team-panel__empty-sub muted">Invite colleagues to share screening runs and job profiles.</p>
          <Btn icon="plus" variant="primary" size="sm" onClick={onInviteClick}>Invite member</Btn>
        </div>
      ) : (
        <div className="team-grid-scroll">
          <div className="team-grid" role="table" aria-label="Workspace members">
            <div className="team-grid__head" role="row">
              <span role="columnheader">Member</span>
              <span role="columnheader">Role</span>
              <span role="columnheader">Budget</span>
              <span role="columnheader" className="col-num">Spent</span>
              <span role="columnheader">Joined</span>
              <span className="sr-only" role="columnheader">Actions</span>
            </div>

            {members.map((m) => (
              <div key={m.id} className="team-row" role="row">
                <div className="team-row__member" role="cell">
                  <MemberAvatar name={m.name} email={m.email} avatarUrl={m.avatar_url} />
                  <div className="team-member__copy">
                    <div className="team-member__name">
                      {m.name || m.email}
                      {m.is_current_user && <span className="team-member__you">You</span>}
                    </div>
                    {m.name && <div className="team-member__email">{m.email}</div>}
                  </div>
                </div>
                <div role="cell">
                  <TeamRoleSelect
                    value={m.role}
                    email={m.email}
                    onChange={(e) => onRoleChange(m.id, e.target.value)}
                  />
                </div>
                <div role="cell">
                  <TeamBudgetField
                    member={m}
                    budgetDrafts={budgetDrafts}
                    budgetSaving={budgetSaving}
                    onDraftChange={onBudgetDraftChange}
                    onSave={onBudgetSave}
                  />
                </div>
                <div className="team-spent col-num" role="cell" style={{ color: spentColor(m.ai_status) }}>
                  {m.role === 'viewer' ? '—' : formatUsd(m.ai_spent_usd ?? 0)}
                </div>
                <div className="team-joined" role="cell">{formatJoined(m.joined_at)}</div>
                <div className="team-row__actions" role="cell">
                  <IconBtn
                    name="trash"
                    title="Remove member"
                    onClick={() => onRemoveMember({ type: 'member', id: m.id, label: m.name || m.email })}
                  />
                </div>
              </div>
            ))}

            {pending.length > 0 && (
              <>
                <div className="team-grid__divider" role="row">
                  <span>Pending invitations</span>
                </div>
                {pending.map((inv) => (
                  <div key={inv.id} className="team-row team-row--pending" role="row">
                    <div className="team-row__member" role="cell">
                      <MemberAvatar name={null} email={inv.email} pending />
                      <div className="team-member__copy">
                        <div className="team-member__name">{inv.email}</div>
                        <Badge tone="info">Pending</Badge>
                      </div>
                    </div>
                    <div role="cell">
                      <span className="team-role-readonly">{labelForRole(inv.role)}</span>
                    </div>
                    <div role="cell"><span className="team-cell__na">—</span></div>
                    <div className="team-spent col-num" role="cell">—</div>
                    <div className="team-joined" role="cell">{formatJoined(inv.invited_at)}</div>
                    <div className="team-row__actions" role="cell">
                      <IconBtn
                        name="trash"
                        title="Revoke invite"
                        onClick={() => onRevokeInvite({ type: 'invite', id: inv.id, label: inv.email })}
                      />
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatJoined(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

function formatUsd(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function spentColor(status) {
  if (status === 'blocked') return 'var(--bad-ink)';
  if (status === 'warn') return 'var(--warn-ink, #b45309)';
  return undefined;
}

function SettingsPage() {
  const { isAdmin } = useAuth();
  const [settings, setSettings] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [saveMsg, setSaveMsg] = React.useState(null);

  const [team, setTeam] = React.useState(null);
  const [teamLoading, setTeamLoading] = React.useState(true);
  const [teamError, setTeamError] = React.useState(null);
  const [showInvite, setShowInvite] = React.useState(false);
  const [inviting, setInviting] = React.useState(false);
  const [confirmRemove, setConfirmRemove] = React.useState(null);
  const [budgetDrafts, setBudgetDrafts] = React.useState({});
  const [budgetSaving, setBudgetSaving] = React.useState(null);

  // AI section
  const [anthropicKey, setAnthropicKey] = React.useState('');
  const [openaiKey, setOpenaiKey] = React.useState('');
  const [defaultModel, setDefaultModel] = React.useState('claude-sonnet-4-6');

  // Screening defaults
  const [confidenceThreshold, setConfidenceThreshold] = React.useState(60);

  // Data retention
  const [cvRetentionDays, setCvRetentionDays] = React.useState(90);
  const [evaluationRetentionDays, setEvaluationRetentionDays] = React.useState<number | 'never'>(730);

  const loadTeam = React.useCallback(() => {
    setTeamLoading(true);
    setTeamError(null);
    api.workspace.listMembers()
      .then(setTeam)
      .catch((e) => setTeamError(e?.message ?? 'Failed to load team.'))
      .finally(() => setTeamLoading(false));
  }, []);

  React.useEffect(() => {
    api.settings.get()
      .then((s) => {
        setSettings(s);
        setDefaultModel(s.default_model ?? 'claude-sonnet-4-6');
        setConfidenceThreshold(s.confidence_threshold ?? 60);
        setCvRetentionDays(s.cv_retention_days ?? 90);
        setEvaluationRetentionDays(
          s.evaluation_retention_days == null ? 'never' : s.evaluation_retention_days,
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    if (isAdmin) loadTeam();
  }, [isAdmin, loadTeam]);

  const save = async (body) => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await api.settings.update(body);
      setSaveMsg({ ok: true, text: 'Saved.' });
      // Re-fetch to update has_*_key indicators
      const s = await api.settings.get();
      setSettings(s);
    } catch (e) {
      setSaveMsg({ ok: false, text: e.message ?? 'Save failed.' });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  };

  if (!isAdmin) return <Navigate to="/jobs" replace />;

  if (loading) return <div className="page"><div className="muted" style={{ padding: 32 }}>Loading settings…</div></div>;

  const supportedModels = settings?.supported_models ?? ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5-20251001', 'gpt-4o', 'gpt-4o-mini'];

  const handleInvite = async ({ email, role }) => {
    setInviting(true);
    try {
      await api.workspace.invite({ email, role });
      loadTeam();
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (memberId, role) => {
    try {
      await api.workspace.updateMemberRole(memberId, role);
      loadTeam();
    } catch (e) {
      setTeamError(e?.message ?? 'Could not update role.');
    }
  };

  const handleBudgetSave = async (member) => {
    const draft = budgetDrafts[member.id];
    const raw = draft !== undefined ? draft : (member.ai_budget_usd ?? '');
    const trimmed = String(raw).trim();
    const value = trimmed === '' ? null : Number(trimmed);
    if (trimmed !== '' && (!Number.isFinite(value) || value < 0)) {
      setTeamError('Budget must be a non-negative number or empty for unlimited.');
      return;
    }
    setBudgetSaving(member.id);
    setTeamError(null);
    try {
      await api.workspace.updateMemberBudget(member.id, value);
      loadTeam();
      setBudgetDrafts((prev) => {
        const next = { ...prev };
        delete next[member.id];
        return next;
      });
    } catch (e) {
      setTeamError(e?.message ?? 'Could not save budget.');
    } finally {
      setBudgetSaving(null);
    }
  };

  const handleRemove = async () => {
    if (!confirmRemove) return;
    try {
      if (confirmRemove.type === 'member') {
        await api.workspace.removeMember(confirmRemove.id);
      } else {
        await api.workspace.revokeInvite(confirmRemove.id);
      }
      setConfirmRemove(null);
      loadTeam();
    } catch (e) {
      setTeamError(e?.message ?? 'Could not remove.');
      setConfirmRemove(null);
    }
  };

  return (
    <div className="page">
      {saveMsg && (
        <div style={{ fontSize: 13, color: saveMsg.ok ? 'var(--ok-ink, green)' : 'var(--bad)', marginBottom: 16 }}>
          {saveMsg.text}
        </div>
      )}

      <Section
        title="AI provider"
        sub="Workspace API keys are encrypted at rest and never exposed to the browser after saving. Keys you enter here replace any previously stored key."
      >
        <div className="col" style={{ gap: 14 }}>
          <div className="row" style={{ gap: 12, alignItems: 'flex-end' }}>
            <Field label="Default model" style={{ flex: 1 }}>
              <select className="sel" value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)}>
                {supportedModels.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Btn
              variant="primary"
              disabled={saving}
              onClick={() => save({ default_model: defaultModel })}
            >
              Save
            </Btn>
          </div>

          <Field
            label="Anthropic API key"
            hint={settings?.has_anthropic_key ? 'Key stored · enter a new key to replace it.' : 'No key stored.'}
          >
            <div className="row" style={{ gap: 8 }}>
              <input
                className="inp inp--mono"
                type="password"
                placeholder={settings?.has_anthropic_key ? '••••••••••••••••••••••••••' : 'sk-ant-…'}
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                autoComplete="off"
                style={{ flex: 1 }}
              />
              <Btn
                variant="ghost"
                disabled={saving || !anthropicKey.trim()}
                onClick={() => { save({ anthropic_key: anthropicKey }); setAnthropicKey(''); }}
              >
                Save key
              </Btn>
            </div>
          </Field>

          <Field
            label="OpenAI API key"
            hint={settings?.has_openai_key ? 'Key stored · enter a new key to replace it.' : 'No key stored.'}
          >
            <div className="row" style={{ gap: 8 }}>
              <input
                className="inp inp--mono"
                type="password"
                placeholder={settings?.has_openai_key ? '••••••••••••••••••••••••••' : 'sk-…'}
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                autoComplete="off"
                style={{ flex: 1 }}
              />
              <Btn
                variant="ghost"
                disabled={saving || !openaiKey.trim()}
                onClick={() => { save({ openai_key: openaiKey }); setOpenaiKey(''); }}
              >
                Save key
              </Btn>
            </div>
          </Field>
        </div>
      </Section>

      <Section
        title="Screening defaults"
        sub="Apply across every new screening run."
      >
        <div className="col" style={{ gap: 4 }}>
          <SetRow label="Minimum confidence" hint="Below this, a criterion match is flagged for manual review.">
            <div className="row" style={{ gap: 8 }}>
              <select
                className="sel"
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
                style={{ width: 160 }}
              >
                {CONFIDENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <Btn variant="ghost" disabled={saving} onClick={() => save({ confidence_threshold: confidenceThreshold })}>Save</Btn>
            </div>
          </SetRow>
        </div>
      </Section>

      <Section
        title="Team &amp; access"
        sub="Editors run screenings and manage jobs. Viewers see results only. Admins control settings and membership."
      >
        <TeamAccessPanel
          team={team}
          teamLoading={teamLoading}
          teamError={teamError}
          budgetDrafts={budgetDrafts}
          budgetSaving={budgetSaving}
          onInviteClick={() => setShowInvite(true)}
          onRoleChange={handleRoleChange}
          onBudgetDraftChange={(id, value) => setBudgetDrafts((prev) => ({ ...prev, [id]: value }))}
          onBudgetSave={handleBudgetSave}
          onRemoveMember={setConfirmRemove}
          onRevokeInvite={setConfirmRemove}
        />

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
      </Section>

      {settings?.has_recruitee_key && (
        <Section
          title="Integrations"
          sub="Recruitee is connected via a platform-managed API token."
        >
          <div className="callout" style={{ fontSize: 13, lineHeight: 1.55 }}>
            Pipeline pushes from screening results update Recruitee using the shared integration token.
            Recruitee audit logs will show{' '}
            <strong>{settings.recruitee_platform_actor_label ?? 'the platform integration account'}</strong>,
            not the Caliper user who clicked. Caliper always records who made each disposition decision.
          </div>
        </Section>
      )}

      <Section
        title="Data retention"
        sub="Uploaded CV files and old screening runs are purged automatically (daily). Recruitee CVs are never stored in Caliper. Runs with recruiter overrides are never auto-deleted."
      >
        <div className="col" style={{ gap: 4 }}>
          <SetRow label="CV files" hint="Uploaded PDFs in S3 only — not Recruitee.">
            <select
              className="sel"
              style={{ width: 160 }}
              value={cvRetentionDays}
              onChange={(e) => setCvRetentionDays(Number(e.target.value))}
            >
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
              <option value={365}>1 year</option>
            </select>
          </SetRow>
          <SetRow label="Evaluation results" hint="Scores, quotes, and run history.">
            <select
              className="sel"
              style={{ width: 160 }}
              value={evaluationRetentionDays === 'never' ? 'never' : evaluationRetentionDays}
              onChange={(e) => {
                const v = e.target.value;
                setEvaluationRetentionDays(v === 'never' ? 'never' : Number(v));
              }}
            >
              <option value={180}>180 days</option>
              <option value={365}>1 year</option>
              <option value={730}>2 years</option>
              <option value="never">Indefinite</option>
            </select>
          </SetRow>
          <SetRow label="Recruiter overrides" hint="Runs with an override are kept until you delete them manually.">
            <span className="mono muted" style={{ fontSize: 12 }}>Audit-protected · not auto-deleted</span>
          </SetRow>
        </div>
        <div className="row" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line-soft)', justifyContent: 'flex-end', gap: 8 }}>
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
        </div>
      </Section>
    </div>
  );
}

const Section = ({ title, sub, children }) => (
  <div className="set-grid">
    <div>
      <h3 className="set-grid__title">{title}</h3>
      <div className="set-grid__sub">{sub}</div>
    </div>
    <div className="set-grid__body">{children}</div>
  </div>
);

const SetRow = ({ label, hint, children }) => (
  <div className="set-row">
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="set-row__lbl">{label}</div>
      {hint && <div className="set-row__hint">{hint}</div>}
    </div>
    <div>{children}</div>
  </div>
);

const ToggleRow = ({ on: initial }) => {
  const [on, setOn] = React.useState(initial);
  return <Toggle on={on} onChange={setOn}/>;
};

export default SettingsPage;
