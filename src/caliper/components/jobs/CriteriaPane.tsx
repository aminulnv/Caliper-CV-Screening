// @ts-nocheck
import React from 'react'
import { api } from '@/services/api'
import {
  PROVIDER_LABELS,
  firstConfiguredModel,
  isProviderConfigured,
  labelForModel,
  modelsForProvider,
  providerForModel,
} from '@/lib/screening-models'
import { CriteriaList, newCriterionId } from '@/caliper/components/jobs/CriteriaList'
import { Btn, Field, Icon } from '@/caliper/ui'

function ScreeningModelPicker({ modelId, onChange, settings, disabled = false }) {
  const provider = providerForModel(modelId);
  const providerModels = modelsForProvider(provider);
  const claudeReady = isProviderConfigured('claude', settings);
  const openaiReady = isProviderConfigured('openai', settings);

  const onProviderChange = (nextProvider) => {
    const next = firstConfiguredModel(nextProvider, settings)
      ?? modelsForProvider(nextProvider)[0]?.id;
    if (next) onChange(next);
  };

  return (
    <div className="card">
      <div className="card__head">
        <Icon name="sparkle" size={14} className="muted"/>
        <span className="card__title">Screening model</span>
      </div>
      <div className="card__body col" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label="Provider" style={{ flex: '1 1 180px', minWidth: 160 }}>
            <select
              className="sel"
              value={provider}
              disabled={disabled}
              onChange={(e) => onProviderChange(e.target.value)}
            >
              <option value="claude">{PROVIDER_LABELS.claude}</option>
              <option value="openai">{PROVIDER_LABELS.openai}</option>
            </select>
          </Field>
          <Field label="Model" style={{ flex: '2 1 220px', minWidth: 200 }}>
            <select
              className="sel"
              value={modelId}
              disabled={disabled}
              onChange={(e) => onChange(e.target.value)}
            >
              {providerModels.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
          Used when you <strong>Run screening</strong> on this job. API keys are configured in{' '}
          <strong>Settings → AI provider</strong>.
        </div>
        {provider === 'claude' && !claudeReady && (
          <div className="callout">Add an Anthropic API key in Settings to run screening with Claude.</div>
        )}
        {provider === 'openai' && !openaiReady && (
          <div className="callout">Add an OpenAI API key in Settings to run screening with OpenAI.</div>
        )}
        {settings?.default_model && settings.default_model !== modelId && (
          <div className="muted" style={{ fontSize: 11.5 }}>
            Workspace default: <span className="mono">{labelForModel(settings.default_model)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function CriteriaPane({
  profile,
  mh, setMH, nh, setNH, rf, setRF, showBias, setShowBias,
  workspaceSettings, screeningModel, setScreeningModel,
  shortlistStageId, setShortlistStageId, shortlistStageName, setShortlistStageName,
  onSave, saveState, isHero,
  criteriaGenState, onGenerateCriteria, hasUsableDescription, canEdit = true,
  calibration, calibrationByCriterionId, markCriteriaDirty,
}) {
  const [pipelineStages, setPipelineStages] = React.useState([]);
  const [stagesLoading, setStagesLoading] = React.useState(false);

  React.useEffect(() => {
    if (isHero || profile?.source !== 'recruitee' || !profile?.id) {
      setPipelineStages([]);
      return;
    }
    let cancelled = false;
    setStagesLoading(true);
    api.jobs.pipelineStages(profile.id)
      .then((res) => { if (!cancelled) setPipelineStages(res.stages ?? []); })
      .catch(() => { if (!cancelled) setPipelineStages([]); })
      .finally(() => { if (!cancelled) setStagesLoading(false); });
    return () => { cancelled = true; };
  }, [profile?.id, profile?.source, isHero]);

  const [biasPending, setBiasPending] = React.useState(null);
  const generating = criteriaGenState?.status === 'loading';
  const flagged = calibration?.flagged ?? [];
  const hasArchivedFlagged = flagged.some((item) => item.archived);

  const addBiasedCriterion = () => {
    if (!biasPending) return;
    const item = {
      id: newCriterionId(),
      name: biasPending.name,
      weight: biasPending.weight,
      biased: true,
    };
    if (biasPending.kind === 'must') setMH((prev) => [...prev, item]);
    else if (biasPending.kind === 'nice') setNH((prev) => [...prev, item]);
    else setRF((prev) => [...prev, item]);
    setBiasPending(null);
    setShowBias(false);
  };

  return (
    <div className="col" style={{ gap: 16 }}>
      {saveState?.message && saveState.status !== 'idle' && (
        <div
          className="jobs-save-banner"
          role="status"
          style={{ color: saveState.status === 'error' ? 'var(--bad)' : 'var(--ok-ink, green)' }}
        >
          {saveState.message}
        </div>
      )}
      {!isHero && (
        <div className="callout" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ flex: '1 1 220px', fontSize: 13 }}>
            {hasUsableDescription
              ? 'Criteria can be generated from the job description on the Overview tab. Open a job with no saved criteria to auto-generate.'
              : 'Paste the full job description on Overview, then generate criteria here.'}
            {criteriaGenState?.message && (
              <div
                style={{
                  marginTop: 6,
                  color:
                    criteriaGenState.status === 'error'
                      ? 'var(--bad)'
                      : criteriaGenState.status === 'loading'
                        ? 'var(--muted)'
                        : 'var(--ok-ink, green)',
                }}
              >
                {criteriaGenState.message}
              </div>
            )}
          </div>
          {canEdit && (
            <Btn
              variant="default"
              icon="sparkle"
              disabled={generating || !hasUsableDescription}
              onClick={() => onGenerateCriteria && onGenerateCriteria()}
            >
              {generating ? 'Generating…' : 'Generate from job description'}
            </Btn>
          )}
        </div>
      )}
      {flagged.length > 0 && (
        <div className="calibration-banner">
          <div className="calibration-banner__label mono">Calibration</div>
          <div className="calibration-banner__list">
            {flagged.map((item) => (
              <div key={item.criterion_id} className="calibration-banner__item">
                <strong>{item.criterion_name}</strong>
                <span className="muted"> — {item.message}</span>
              </div>
            ))}
          </div>
          {hasArchivedFlagged && (
            <div className="muted calibration-banner__foot">
              Some flagged criteria are archived but still have override history from past runs.
            </div>
          )}
        </div>
      )}
      <ScreeningModelPicker
        modelId={screeningModel}
        onChange={setScreeningModel}
        settings={workspaceSettings}
        disabled={!canEdit}
      />
      {!isHero && profile?.source === 'recruitee' && (
        <div className="card" style={{ padding: '14px 18px' }}>
          <div className="mono muted" style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            Recruitee push defaults
          </div>
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, marginBottom: 10 }}>
            Optional default stage when shortlisting with “Push to Recruitee” from screening results.
            Caliper still records who decided; Recruitee shows the platform integration account.
          </div>
          {stagesLoading ? (
            <div className="muted" style={{ fontSize: 12 }}>Loading pipeline stages…</div>
          ) : pipelineStages.length === 0 ? (
            <div className="muted" style={{ fontSize: 12 }}>No Recruitee pipeline stages available for this job.</div>
          ) : (
            <select
              className="sel"
              style={{ height: 34, minWidth: 240, fontSize: 13 }}
              value={shortlistStageId || ''}
              disabled={!canEdit}
              onChange={(e) => {
                markCriteriaDirty?.();
                const id = e.target.value;
                const stage = pipelineStages.find((s) => s.id === id);
                setShortlistStageId(id);
                setShortlistStageName(stage?.name ?? '');
              }}
            >
              <option value="">No default shortlist stage</option>
              {pipelineStages.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          {shortlistStageName && (
            <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
              Current default: <strong>{shortlistStageName}</strong>
            </div>
          )}
        </div>
      )}
      <CriteriaList kind="must" label="Must-have criteria"
        help="Missing or weak evidence applies a heavy score penalty. Quoted CV evidence counts fully; inferred matches count for less."
        items={mh} setItems={setMH} canEdit={canEdit}
        calibrationByCriterionId={calibrationByCriterionId}
        onBiasWarn={(payload) => { setBiasPending({ ...payload, kind: 'must' }); setShowBias(true); }}
        wrapPanelClass="jobs-panel--criteria-must" />
      <CriteriaList kind="nice" label="Nice-to-have"
        help="Boosts when matched with evidence. Doesn't penalise when missing."
        items={nh} setItems={setNH} canEdit={canEdit}
        calibrationByCriterionId={calibrationByCriterionId}
        onBiasWarn={(payload) => { setBiasPending({ ...payload, kind: 'nice' }); setShowBias(true); }}
        wrapPanelClass="jobs-panel--criteria-nice" />
      <CriteriaList kind="flag" label="Red flags"
        help="If matched, points are deducted (weight ×4 per flag, ×2 if inferred) and the candidate is marked Flagged."
        items={rf} setItems={setRF} canEdit={canEdit}
        calibrationByCriterionId={calibrationByCriterionId}
        onBiasWarn={(payload) => { setBiasPending({ ...payload, kind: 'flag' }); setShowBias(true); }}
        wrapPanelClass="jobs-panel--criteria-flag" />
      {showBias && (
        <div className="bias-banner">
          <Icon name="alert" size={16} className="bias-banner__icon"/>
          <div>
            <div className="bias-banner__title">This criterion may correlate with demographic bias.</div>
            <div className="bias-banner__body">
              Patterns like employment gaps, short tenures, or age-related wording are commonly associated with protected characteristics.
              If you add it anyway, it is saved with a bias flag on the audit trail.
              <div className="row" style={{ marginTop: 10, gap: 8 }}>
                <Btn size="sm" variant="default" onClick={addBiasedCriterion}>Add anyway (logged)</Btn>
                <Btn size="sm" variant="ghost" onClick={() => { setBiasPending(null); setShowBias(false); }}>Don&apos;t add</Btn>
              </div>
            </div>
          </div>
        </div>
      )}

      {!isHero && canEdit && (
        <div className="row" style={{ gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
          {saveState?.message && (
            <span
              style={{
                fontSize: 12.5,
                color: saveState.status === 'error' ? 'var(--bad)' : 'var(--ok-ink, green)',
              }}
            >
              {saveState.message}
            </span>
          )}
          <Btn
            variant="primary"
            icon="check"
            disabled={saveState?.status === 'saving'}
            onClick={() => onSave && onSave()}
          >
            {saveState?.status === 'saving' ? 'Saving…' : 'Save criteria & model'}
          </Btn>
        </div>
      )}

      {!isHero && !canEdit && (
        <p className="viewer-lock-hint">
          <Icon name="lock" size={12} aria-hidden />
          View-only — contact an editor to change criteria.
        </p>
      )}

      <div className="card">
        <div className="card__head">
          <Icon name="info" size={14} className="muted"/>
          <span className="card__title">How weights work</span>
        </div>
        <div className="card__body" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 32 }}>
          <div>
            <div style={{ marginBottom: 10, fontSize: 13, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
              Scoring uses a <strong>binary checklist</strong>: each line is Met or Not met.
              Your overall score is the <strong>% of must + nice criteria met</strong>, minus deductions for triggered red flags (weight ×4 each).
            </div>
            <div className="muted" style={{ fontSize: 12.5, maxWidth: '54ch' }}>
              Weights affect red-flag deductions only; checklist percentages count each line equally.
            </div>
          </div>
          <div className="col" style={{ gap: 4, minWidth: 200 }}>
            {[1, 2, 3, 4, 5].map(w => (
              <div key={w} className="row" style={{ gap: 8 }}>
                <span className="mono muted" style={{ width: 24, fontSize: 11 }}>×{w}</span>
                <span style={{
                  height: 6, borderRadius: 3,
                  background: 'var(--brand-primary)',
                  width: `${w * 16 + 30}px`,
                  opacity: 0.4 + w * 0.12,
                }}/>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export { CriteriaPane }
