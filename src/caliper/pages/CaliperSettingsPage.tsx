// @ts-nocheck
// Page 5 — Settings
import React from 'react'
import { Btn, Badge, Field, Toggle } from '@/caliper/ui'

function SettingsPage() {
  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="page__eyebrow">Settings</div>
          <h1 className="page__title">Workspace settings</h1>
          <div className="page__sub">
            Integrations, screening defaults, access, notifications, and data retention.
          </div>
        </div>
      </div>

      <Section
        title="Recruitee integration"
        sub="Caliper pulls open positions and applicants directly from your Recruitee account."
      >
        <div className="col" style={{ gap: 14 }}>
          <div className="row" style={{ gap: 12 }}>
            <Field label="Base URL"><input className="inp inp--mono" defaultValue="https://acme.recruitee.com/api/"/></Field>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <Field label="API key" hint="Stored encrypted at rest. Only Admins can view.">
              <input className="inp inp--mono" defaultValue="rec_live_••••••••••••••••••••J7n4"/>
            </Field>
          </div>
          <div className="row" style={{ gap: 10, marginTop: 6 }}>
            <Btn icon="check" variant="ghost">Test connection</Btn>
            <Badge tone="ok" dot>Connected · 7 open positions</Badge>
            <span className="muted mono" style={{ fontSize: 11, marginLeft: 'auto' }}>Last verified 4 min ago</span>
          </div>
        </div>
      </Section>

      <Section
        title="n8n webhook"
        sub="Each run posts a structured payload to your n8n workflow, which calls Claude and writes the results back."
      >
        <div className="col" style={{ gap: 14 }}>
          <Field label="Webhook URL" hint="Sample payload: job, profile_id (job id), criteria[], cvs[], run_id">
            <input className="inp inp--mono" defaultValue="https://flows.acme.io/webhook/cv-screen/v3"/>
          </Field>
          <div className="row" style={{ gap: 10 }}>
            <Btn icon="webhook" variant="ghost">Send test payload</Btn>
            <Badge tone="ok" dot>Last test · 200 OK · 412ms</Badge>
          </div>
          <details style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
            <summary style={{ cursor: 'default' }}>View sample payload</summary>
            <pre className="mono" style={{ marginTop: 8, padding: 12, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11.5, lineHeight: 1.5, color: 'var(--ink-soft)', overflow: 'auto' }}>
{`{
  "run_id": "13062026",
  "job": { "title": "...", "description": "..." },
  "profile_id": "PROF-014",
  "criteria": [
    { "id": "m1", "kind": "must", "weight": 5, "name": "5+ years in-house tech recruiting" },
    ...
  ],
  "cvs": [ { "id": "rec_app_29481", "name": "...", "file": { ... } } ]
}`}
            </pre>
          </details>
        </div>
      </Section>

      <Section
        title="Screening defaults"
        sub="Apply across every new screening run. Individual jobs can override via their saved rubric."
      >
        <div className="col" style={{ gap: 4 }}>
          <SetRow label="Minimum confidence" hint="Below this, a criterion match is flagged for review instead of counted cleanly.">
            <select className="sel" defaultValue="0.75" style={{ width: 130 }}>
              <option value="0.6">Lenient · 60%</option>
              <option value="0.75">Balanced · 75%</option>
              <option value="0.85">Strict · 85%</option>
            </select>
          </SetRow>
          <SetRow label="Allow implied matches" hint="If off, Claude only counts a criterion as met when there's a direct quote in the CV.">
            <ToggleRow on={true}/>
          </SetRow>
          <SetRow label="Auto-extract languages" hint="Detect language proficiency mentions even when no explicit list is in the CV.">
            <ToggleRow on={true}/>
          </SetRow>
          <SetRow label="Penalise unsourced criteria" hint="Reduce score weight on any criterion Claude couldn't quote directly.">
            <ToggleRow on={false}/>
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
                  <td><IconBtn name="edit" size={13}/></td>
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
        title="Notifications"
        sub="Who hears about what, and where."
      >
        <div className="col" style={{ gap: 4 }}>
          <SetRow label="Run completed" hint="The owner gets a Slack DM with a link to results."><ToggleRow on={true}/></SetRow>
          <SetRow label="CVs failed to parse" hint="Sent to owner + workspace #ta-ops channel."><ToggleRow on={true}/></SetRow>
          <SetRow label="Job criteria not reviewed in 90 days" hint="Quarterly nudge to the job owner."><ToggleRow on={true}/></SetRow>
          <SetRow label="Bias notice triggered" hint="Logged in audit trail and posted to #ta-ops."><ToggleRow on={false}/></SetRow>
        </div>
      </Section>

      <Section
        title="Data retention"
        sub="How long CV data lives in Caliper before it's automatically deleted."
      >
        <div className="col" style={{ gap: 4 }}>
          <SetRow label="CV files" hint="Original PDFs / DOCX. Parsed text is retained separately.">
            <select className="sel" defaultValue="90" style={{ width: 160 }}>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="180">180 days</option>
              <option value="365">1 year</option>
            </select>
          </SetRow>
          <SetRow label="Evaluation results" hint="Scores, quotes, decisions, audit trail.">
            <select className="sel" defaultValue="730" style={{ width: 160 }}>
              <option value="180">180 days</option>
              <option value="365">1 year</option>
              <option value="730">2 years</option>
              <option value="never">Indefinite</option>
            </select>
          </SetRow>
          <SetRow label="Recruiter overrides" hint="Always retained for the full audit period regardless of CV retention.">
            <span className="mono muted" style={{ fontSize: 12 }}>Indefinite · audit-protected</span>
          </SetRow>
        </div>
        <div className="row" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line-soft)', justifyContent: 'flex-end', gap: 8 }}>
          <Btn variant="ghost" icon="download">Export workspace data</Btn>
          <Btn variant="danger-ghost" icon="trash">Delete workspace</Btn>
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
