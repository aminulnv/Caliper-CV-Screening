// @ts-nocheck
// Page 5 — Settings
import React from 'react'
import { Btn, Badge, Field, Toggle } from '@/caliper/ui'
import { api } from '@/services/api'

const CONFIDENCE_OPTIONS = [
  { value: 50, label: 'Lenient · 50%' },
  { value: 60, label: 'Balanced · 60%' },
  { value: 75, label: 'Strict · 75%' },
  { value: 85, label: 'Very strict · 85%' },
];

function SettingsPage() {
  const [settings, setSettings] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [saveMsg, setSaveMsg] = React.useState(null);

  // Recruitee section
  const [recruiteeUrl, setRecruiteeUrl] = React.useState('');
  const [recruiteeKey, setRecruiteeKey] = React.useState('');
  const [testingRecruitee, setTestingRecruitee] = React.useState(false);
  const [recruiteeTestResult, setRecruiteeTestResult] = React.useState(null);

  // AI section
  const [anthropicKey, setAnthropicKey] = React.useState('');
  const [openaiKey, setOpenaiKey] = React.useState('');
  const [defaultModel, setDefaultModel] = React.useState('claude-sonnet-4-6');

  // Screening defaults
  const [confidenceThreshold, setConfidenceThreshold] = React.useState(60);

  // Data retention
  const [cvRetentionDays, setCvRetentionDays] = React.useState(90);
  const [evaluationRetentionDays, setEvaluationRetentionDays] = React.useState<number | 'never'>(730);

  React.useEffect(() => {
    api.settings.get()
      .then((s) => {
        setSettings(s);
        setRecruiteeUrl(s.recruitee_base_url ?? '');
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

  const save = async (body) => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await api.settings.update(body);
      setSaveMsg({ ok: true, text: 'Saved.' });
      // Re-fetch to update has_*_key indicators
      const s = await api.settings.get();
      setSettings(s);
      setRecruiteeUrl(s.recruitee_base_url ?? '');
    } catch (e) {
      setSaveMsg({ ok: false, text: e.message ?? 'Save failed.' });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  };

  const testRecruitee = async () => {
    setTestingRecruitee(true);
    setRecruiteeTestResult(null);
    const body: { recruitee_base_url?: string; recruitee_key?: string } = {};
    if (recruiteeUrl.trim()) body.recruitee_base_url = recruiteeUrl.trim();
    if (recruiteeKey.trim()) body.recruitee_key = recruiteeKey.trim();
    try {
      const res = await api.settings.testRecruitee(body);
      setRecruiteeTestResult({ ok: true, text: `Connected · ${res.jobs_found} open position${res.jobs_found === 1 ? '' : 's'}` });
    } catch (e) {
      setRecruiteeTestResult({ ok: false, text: e.message ?? 'Connection failed' });
    } finally {
      setTestingRecruitee(false);
    }
  };

  if (loading) return <div className="page"><div className="muted" style={{ padding: 32 }}>Loading settings…</div></div>;

  const supportedModels = settings?.supported_models ?? ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5-20251001', 'gpt-4o', 'gpt-4o-mini'];

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
        title="Recruitee integration"
        sub="Caliper pulls open positions and applicants directly from your Recruitee account."
      >
        <div className="col" style={{ gap: 14 }}>
          <Field
            label="API base URL"
            hint="From Recruitee → Settings → Apps and plugins → API tokens (company ID is on that page)."
          >
            <input
              className="inp inp--mono"
              value={recruiteeUrl}
              onChange={(e) => setRecruiteeUrl(e.target.value)}
              placeholder="https://api.recruitee.com/c/your-company-id"
            />
          </Field>
          <Field
            label="API key"
            hint={settings?.has_recruitee_key ? 'Key stored · enter a new key to replace it.' : 'No key stored.'}
          >
            <input
              className="inp inp--mono"
              type="password"
              placeholder={settings?.has_recruitee_key ? '••••••••••••••••••••••••••' : 'rec_live_…'}
              value={recruiteeKey}
              onChange={(e) => setRecruiteeKey(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <div className="row" style={{ gap: 10, marginTop: 2 }}>
            <Btn
              variant="primary"
              disabled={saving}
              onClick={() => {
                const body = {};
                if (recruiteeUrl) body.recruitee_base_url = recruiteeUrl;
                if (recruiteeKey.trim()) body.recruitee_key = recruiteeKey;
                if (Object.keys(body).length) { save(body); setRecruiteeKey(''); }
              }}
            >
              Save
            </Btn>
            <Btn icon="check" variant="ghost" disabled={testingRecruitee} onClick={testRecruitee}>
              {testingRecruitee ? 'Testing…' : 'Test connection'}
            </Btn>
            {recruiteeTestResult && (
              <Badge tone={recruiteeTestResult.ok ? 'ok' : 'warn'} dot>
                {recruiteeTestResult.text}
              </Badge>
            )}
          </div>
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
        sub="TA team has full access. Hiring managers see results only. Admins manage settings."
      >
        <div className="card" style={{ border: 'none' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Member</th>
                <th style={{ width: 160 }}>Role</th>
                <th style={{ width: 140 }}>Joined</th>
                <th style={{ width: 80 }}/>
              </tr>
            </thead>
            <tbody>
              {[
                ['Sasha Kerridge', 'TA · Admin', 'Sep 2024', 'admin'],
                ['Mara Achterberg', 'TA', 'Jan 2025', 'ta'],
                ['Idris Park', 'TA', 'Mar 2025', 'ta'],
                ['Lior Bashan', 'Hiring manager', 'Apr 2025', 'hm'],
                ['Sirin Akar', 'Hiring manager', 'Feb 2026', 'hm'],
              ].map(([name, role, joined, kind], i) => (
                <tr key={i}>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      <span style={{
                        width: 24, height: 24, borderRadius: '50%',
                        background: 'var(--bg-sunk)', display: 'grid', placeItems: 'center',
                        fontSize: 10, fontWeight: 600,
                      }}>{name.split(' ').map(n => n[0]).join('')}</span>
                      <span style={{ fontWeight: 500 }}>{name}</span>
                    </div>
                  </td>
                  <td>
                    <Badge tone={kind === 'admin' ? 'solid' : kind === 'hm' ? 'ghost' : 'default'}>{role}</Badge>
                  </td>
                  <td className="mono muted" style={{ fontSize: 11.5 }}>{joined}</td>
                  <td/>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line-soft)' }}>
          <Btn icon="plus" variant="ghost">Invite member</Btn>
          <div className="spacer"/>
          <span className="muted mono" style={{ fontSize: 11 }}>5 of 25 seats</span>
        </div>
      </Section>

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
