// @ts-nocheck
import React from 'react'
import { Icon, Btn, IconBtn, PageLoading, PageError, StatusBadge } from '@/caliper/ui'
import { ScoreTrustCard } from '@/caliper/ui-layout'
import { api } from '@/services/api'
import { CriteriaChecklistPanel, ChecklistSummary } from '@/caliper/components/CriteriaChecklist'
import { CandidateHistoryPanel } from '@/caliper/components/CandidateHistoryPanel'
import { CvViewer } from '@/caliper/components/CvViewer'
import { CvQuotesPanel } from '@/caliper/components/CvQuotesPanel'
import { countsFromCandidateRow } from '@/lib/criteria-checklist'
import { DispositionBadge } from '@/caliper/components/DispositionBadge'
import { candidateMetrics } from '../results-utils'
import { Modal } from '@/caliper/ui-overlays'
import { RecruiteeStatusBadge } from './RecruiteeStatusBadge'

function OverrideDialog({ currentMet, onConfirm, onCancel, saving }) {
  const [met, setMet] = React.useState(!currentMet);
  const [note, setNote] = React.useState('');
  return (
    <Modal open title="Override criterion" onClose={onCancel}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
          <input type="radio" checked={met === true} onChange={() => setMet(true)} /> Met
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
          <input type="radio" checked={met === false} onChange={() => setMet(false)} /> Not met
        </label>
      </div>
      <textarea
        className="inp"
        style={{ width: '100%', height: 72, resize: 'vertical' }}
        placeholder="Override note (required)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end', gap: 8 }}>
        <Btn variant="ghost" size="sm" onClick={onCancel}>Cancel</Btn>
        <Btn variant="primary" size="sm" onClick={() => note.trim() && onConfirm(met, note.trim())} disabled={saving || !note.trim()}>
          {saving ? 'Saving…' : 'Confirm override'}
        </Btn>
      </div>
    </Modal>
  );
}

export function CandidateDetailSheet({
  candidateId,
  runId,
  allCandidates,
  onClose,
  onCandidateChange,
  onCandidateUpdated,
  tweaks,
  go,
  canEdit = false,
  onDisposition,
  onMoveToStage,
  useRecruiteePipeline = false,
  pipelineStages = [],
  canPushRecruitee = false,
  recruiteeState = null,
  onPushRecruitee,
  dispositionBusy = false,
}) {
  const [evalData, setEvalData] = React.useState(null);
  const [evalLoading, setEvalLoading] = React.useState(true);
  const [evalError, setEvalError] = React.useState(null);
  const [decisions, setDecisions] = React.useState({});
  const [overrideModal, setOverrideModal] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [cvLink, setCvLink] = React.useState(null);

  const loadEvaluation = React.useCallback(() => {
    setEvalLoading(true);
    setEvalError(null);
    setCvLink(null);
    api.candidates.getEvaluation(candidateId)
      .then((data) => {
        setEvalData(data);
        const initial = {};
        for (const e of data.evaluations ?? []) {
          if (e.overridden_by) initial[e.id] = 'override';
          else if (e.agreed_by) initial[e.id] = 'agree';
        }
        setDecisions(initial);
      })
      .catch((e) => {
        setEvalData(null);
        setEvalError(e instanceof Error ? e.message : 'Could not load evaluation');
      })
      .finally(() => setEvalLoading(false));
  }, [candidateId]);

  React.useEffect(() => {
    loadEvaluation();
  }, [loadEvaluation]);

  const candidate = evalData?.candidate ?? allCandidates.find((c) => c.id === candidateId);

  const sections = React.useMemo(() => {
    const evals = evalData?.evaluations ?? [];
    const grouped = { must: [], nice: [], flag: [] };
    evals.forEach((e) => {
      const kind = e.job_criteria?.kind ?? 'must';
      if (grouped[kind]) grouped[kind].push(e);
    });
    return [
      { kind: 'must', label: 'Must-have criteria',  items: grouped.must },
      { kind: 'nice', label: 'Nice-to-have',         items: grouped.nice },
      { kind: 'flag', label: 'Red flags',            items: grouped.flag },
    ].filter((s) => s.items.length > 0);
  }, [evalData]);

  const handleOverride = async (evalId, met, note) => {
    setSaving(true);
    try {
      const result = await api.candidates.override(evalId, met, note);
      setEvalData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          candidate: result.candidate ?? prev.candidate,
          evaluations: prev.evaluations.map((e) =>
            e.id === evalId
              ? { ...e, met, override_note: note, overridden_by: 'you', agreed_by: null, agreed_at: null }
              : e
          ),
        };
      });
      if (result.candidate) {
        onCandidateUpdated?.(result.candidate, result.score_range);
      }
      setDecisions((d) => ({ ...d, [evalId]: 'override' }));
    } finally {
      setSaving(false);
      setOverrideModal(null);
    }
  };

  const handleAgree = async (evalId) => {
    setSaving(true);
    try {
      await api.candidates.agree(evalId);
      setEvalData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          evaluations: prev.evaluations.map((e) =>
            e.id === evalId ? { ...e, agreed_by: 'you', agreed_at: new Date().toISOString() } : e
          ),
        };
      });
      setDecisions((d) => ({ ...d, [evalId]: 'agree' }));
    } finally {
      setSaving(false);
    }
  };

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!candidate) return null;

  const detailMetrics = candidateMetrics(candidate);

  return (
    <div className="detail" onClick={onClose} role="presentation">
      <div
        className="detail__panel"
        role="dialog"
        aria-modal="true"
        aria-label={`${candidate.name ?? 'Candidate'} details`}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div className="detail__head detail__head--sticky">
            <span style={{
              display: 'inline-grid', placeItems: 'center',
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--bg-sunk)', color: 'var(--ink)',
              fontSize: 12, fontWeight: 600,
            }}>{(candidate.name ?? '??').split(' ').map((n) => n[0]).slice(0, 2).join('')}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 500, letterSpacing: '-0.005em' }}>{candidate.name ?? '—'}</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>
                #{String(allCandidates.findIndex((c) => c.id === candidateId) + 1).padStart(2, '0')}
                {' · '}{candidate.title} · {candidate.location}
              </div>
            </div>
            <ScoreTrustCard
              score={candidate.score ?? 0}
              must={detailMetrics.mustMet}
              nice={detailMetrics.niceMet}
              flag={detailMetrics.flagTriggered}
              confidence={candidate.confidence}
            />
            <StatusBadge s={candidate.status}/>
            {recruiteeState ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <RecruiteeStatusBadge state={recruiteeState} />
                {candidate.disposition && candidate.recruitee_sync_status === 'failed' && (
                  <span className="disposition-badge-wrap__sync-failed" title="Last Caliper push to Recruitee failed">!</span>
                )}
              </span>
            ) : (
              <DispositionBadge
                disposition={candidate.disposition}
                targetStageName={candidate.target_stage_name}
                syncStatus={candidate.recruitee_sync_status}
                recruiteePipeline={useRecruiteePipeline}
              />
            )}
            <IconBtn name="x" size={16} onClick={onClose}/>
          </div>
          <div style={{ padding: '0 22px 8px' }}>
            <ScoreDeductionBreakdown candidate={candidate}/>
          </div>

          {allCandidates.length > 1 && (
            <div style={{ padding: '10px 22px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)' }}>
              <select className="sel" style={{ width: 'min(360px, 100%)', height: 32, fontSize: 12.5 }}
                      value={candidateId} onChange={(e) => onCandidateChange(e.target.value)}>
                {allCandidates.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {c.score ?? '?'}</option>
                ))}
              </select>
              <span className="muted" style={{ fontSize: 11.5 }}>Switch without closing.</span>
            </div>
          )}

          <CandidateHistoryPanel
            candidateId={candidateId}
            onNavigate={(targetRunId) => {
              onClose();
              if (typeof go === 'function') go('results', targetRunId);
            }}
          />

          {canEdit && !useRecruiteePipeline && (
            <div className="disposition-actions" style={{ padding: '12px 22px', borderBottom: '1px solid var(--line)' }}>
              <div className="col" style={{ gap: 10 }}>
                <span className="mono muted" style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Pipeline decision
                </span>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Btn size="sm" variant="ghost" disabled={dispositionBusy}
                       onClick={() => onDisposition?.([candidateId], 'shortlist')}>Shortlist</Btn>
                  <Btn size="sm" variant="ghost" disabled={dispositionBusy}
                       onClick={() => onDisposition?.([candidateId], 'hold')}>Hold</Btn>
                  <Btn size="sm" variant="ghost" disabled={dispositionBusy}
                       onClick={() => onDisposition?.([candidateId], 'reject')}>Reject</Btn>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {evalLoading ? (
            <div className="results-eval-skeleton" aria-busy="true" aria-label="Loading evaluation">
              {[1, 2, 3, 4, 5].map((n) => <div key={n} className="results-eval-skeleton__row" />)}
            </div>
          ) : evalError ? (
            <PageError message={evalError} onRetry={loadEvaluation} />
          ) : (
            <div className="detail__body">
              <div className="detail__cv">
                <CvViewer
                  candidateId={candidateId}
                  candidateName={candidate.name}
                  highlightQuote={cvLink?.quote}
                  highlightKind={cvLink?.kind}
                  highlightLabel={cvLink?.label}
                />
              </div>
              <div className="detail__eval">
                {(candidate.summary || detailMetrics.criteriaMetPct != null) && (
                  <div style={{ padding: '14px 0 8px', borderBottom: '1px solid var(--line)', marginBottom: 12 }}>
                    {detailMetrics.criteriaMetPct != null && (
                      <div style={{ marginBottom: candidate.summary ? 10 : 0 }}>
                        <ChecklistSummary counts={countsFromCandidateRow(candidate)}/>
                        <div style={{ marginTop: 8 }}>
                          <ScoreDeductionBreakdown candidate={candidate}/>
                        </div>
                      </div>
                    )}
                    {candidate.summary && (
                      <>
                        <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Summary</div>
                        <p style={{ fontSize: 13, lineHeight: 1.55 }}>{candidate.summary}</p>
                      </>
                    )}
                    {candidate.parse_warning && (
                      <div style={{ fontSize: 11.5, color: 'var(--warn-ink)', marginTop: 6 }}>
                        <Icon name="alert" size={11}/> {candidate.parse_warning}
                      </div>
                    )}
                  </div>
                )}

                <CvQuotesPanel
                  evaluations={evalData?.evaluations}
                  onQuoteHover={setCvLink}
                  activeQuote={cvLink?.quote}
                />

                <CriteriaChecklistPanel
                  evaluations={evalData?.evaluations}
                  candidate={candidate}
                  sections={sections}
                  decisions={decisions}
                  readOnly={!canEdit}
                  onAgree={(id) => { void handleAgree(id); }}
                  onOverride={(id, currentMet) => setOverrideModal({ evalId: id, currentMet })}
                  onQuoteHover={setCvLink}
                  activeQuote={cvLink?.quote}
                />

                {canEdit && (
                <div className="row" style={{ marginTop: 14, padding: '14px 0', borderTop: '1px solid var(--line)', justifyContent: 'space-between' }}>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    <Icon name="history" size={11}/> Overrides are logged in the job audit trail.
                  </div>
                  <Btn
                    variant="ghost"
                    size="sm"
                    icon="download"
                    onClick={async () => {
                      try {
                        const url = await api.candidates.fetchCvBlobUrl(candidateId);
                        window.open(url, '_blank', 'noopener,noreferrer');
                      } catch {
                        /* CvViewer shows error */
                      }
                    }}
                  >
                    Download CV
                  </Btn>
                </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {overrideModal && (
        <OverrideDialog
          currentMet={overrideModal.currentMet}
          onConfirm={(met, note) => handleOverride(overrideModal.evalId, met, note)}
          onCancel={() => setOverrideModal(null)}
          saving={saving}
        />
      )}
    </div>
  );
}
