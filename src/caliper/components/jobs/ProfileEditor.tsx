// @ts-nocheck
import React from 'react'
import { HERO_PROFILE, getCandidateRowsForJob } from '@/caliper/data'
import { api } from '@/services/api'
import {
  getCachedApplicants,
  loadRecruiteeApplicants,
  prefetchRecruiteeApplicants,
} from '@/lib/applicants-cache'
import { clearJobsCache } from '@/lib/jobs-cache'
import { useAuth } from '@/contexts/AuthContext'
import { runsForDisplay, shapeJobRow, formatJobDate } from '@/lib/job-profile'
import { getProtectedAttributeError } from '@/lib/criteria-validation'
import { RelatedProfilesPane } from '@/caliper/components/RelatedProfilesPane'
import { JobDetailMeta } from '@/caliper/components/jobs/JobDetailMeta'
import { JobTabNav } from '@/caliper/components/jobs/JobTabNav'
import { JobsPanel } from '@/caliper/components/jobs/JobsPanel'
import {
  Icon,
  Badge,
  PageEmpty,
  RunScreeningBtn,
  Btn,
} from '@/caliper/ui'
import { useSetPageTitle } from '@/caliper/PageTitleContext'
import {
  cloneCriteriaItems,
  buildCriteriaPayload,
  isRecruiteePlaceholderDescription,
  isUsableJobDescription,
  mapGeneratedCriteriaItems,
} from '@/caliper/components/jobs/job-criteria-helpers'
import { OverviewPane } from '@/caliper/components/jobs/OverviewPane'
import { CriteriaPane } from '@/caliper/components/jobs/CriteriaPane'
import { RunsPane } from '@/caliper/components/jobs/RunsPane'
import { JobCandidatesPane } from '@/caliper/components/jobs/JobCandidatesPane'

function ProfileEditor({ profile: initialProfile, initialTab, onBack, go, onOpenRunSheet, canEdit = true }) {
  const { user } = useAuth();
  const userId = user?.sub ?? null;
  const isHero = initialProfile.id === HERO_PROFILE.id;
  const [profile, setProfile] = React.useState(initialProfile);
  const [detailRefreshing, setDetailRefreshing] = React.useState(false);

  React.useEffect(() => {
    if (initialProfile.source === 'recruitee' && initialProfile.sourceRef) {
      prefetchRecruiteeApplicants(initialProfile.sourceRef);
    }
  }, [initialProfile.id, initialProfile.source, initialProfile.sourceRef]);
  const [mh, setMHState] = React.useState(() => cloneCriteriaItems(initialProfile.mustHave));
  const [nh, setNHState] = React.useState(() => cloneCriteriaItems(initialProfile.niceToHave));
  const [rf, setRFState] = React.useState(() => cloneCriteriaItems(initialProfile.redFlags));
  const [desc, setDescState] = React.useState(() => initialProfile.description || '');
  const [showBias, setShowBias] = React.useState(false);
  const [workspaceSettings, setWorkspaceSettings] = React.useState(null);
  const [screeningModel, setScreeningModel] = React.useState(
    () => initialProfile.screeningModel || 'claude-sonnet-4-6',
  );
  const [shortlistStageId, setShortlistStageId] = React.useState(
    () => initialProfile.shortlistStageId ?? '',
  );
  const [shortlistStageName, setShortlistStageName] = React.useState(
    () => initialProfile.shortlistStageName ?? '',
  );
  const [saveState, setSaveState] = React.useState({ status: 'idle', message: '' });
  const criteriaDirtyRef = React.useRef(false);
  const generatingCriteriaRef = React.useRef(false);
  const lastAutoCriteriaFingerprintRef = React.useRef('');
  const totalCriteria = mh.length + nh.length + rf.length;
  const [criteriaGenState, setCriteriaGenState] = React.useState({ status: 'idle', message: '' });

  const markCriteriaDirty = React.useCallback(() => {
    criteriaDirtyRef.current = true;
  }, []);

  React.useEffect(() => {
    criteriaDirtyRef.current = false;
    generatingCriteriaRef.current = false;
    lastAutoCriteriaFingerprintRef.current = '';
    setCriteriaGenState({ status: 'idle', message: '' });
  }, [initialProfile.id]);

  const applyGeneratedCriteria = React.useCallback((data) => {
    const nextMh = mapGeneratedCriteriaItems(data.must_have);
    const nextNh = mapGeneratedCriteriaItems(data.nice_to_have);
    const nextRf = mapGeneratedCriteriaItems(data.red_flags);
    markCriteriaDirty();
    setMHState(nextMh);
    setNHState(nextNh);
    setRFState(nextRf);
    profile.mustHave = nextMh;
    profile.niceToHave = nextNh;
    profile.redFlags = nextRf;
  }, [profile, markCriteriaDirty]);

  const runGenerateCriteria = React.useCallback(async (mode = 'manual') => {
    if (!canEdit || isHero) return;
    if (!isUsableJobDescription(desc)) {
      const msg = isRecruiteePlaceholderDescription(desc)
        ? 'Job description is still the Recruitee placeholder. Open Overview, wait for sync, or paste the full JD, then try again.'
        : 'Paste the full job description on the Overview tab first (at least a short paragraph).';
      setCriteriaGenState({ status: 'error', message: msg });
      return;
    }
    if (mode === 'manual' && totalCriteria > 0) {
      const ok = window.confirm(
        'Replace current criteria with new AI-generated ones from the job description?',
      );
      if (!ok) return;
    }
    setCriteriaGenState({
      status: 'loading',
      message: mode === 'auto' ? 'Generating criteria from job description…' : 'Generating criteria…',
    });
    generatingCriteriaRef.current = true;
    try {
      const data = await api.jobs.generateCriteria(profile.id, {
        description: desc,
        model_id: screeningModel,
      });
      applyGeneratedCriteria(data);
      const count = data.must_have.length + data.nice_to_have.length + data.red_flags.length;
      const skipped =
        data.skipped_count > 0 ? ` ${data.skipped_count} line(s) skipped (policy).` : '';
      setCriteriaGenState({
        status: 'done',
        message: `Generated ${count} criteria.${skipped} Review and click Save.`,
      });
    } catch (err) {
      setCriteriaGenState({
        status: 'error',
        message: err?.message ?? 'Could not generate criteria.',
      });
    } finally {
      generatingCriteriaRef.current = false;
    }
  }, [
    isHero,
    desc,
    profile,
    screeningModel,
    totalCriteria,
    applyGeneratedCriteria,
    canEdit,
  ]);

  React.useEffect(() => {
    if (!canEdit || isHero || detailRefreshing) return;
    if (totalCriteria > 0) return;
    if (!isUsableJobDescription(desc)) return;
    if (criteriaDirtyRef.current) return;
    if (generatingCriteriaRef.current) return;

    const fingerprint = `${profile.id}:${desc.length}`;
    if (lastAutoCriteriaFingerprintRef.current === fingerprint) return;
    lastAutoCriteriaFingerprintRef.current = fingerprint;

    runGenerateCriteria('auto');
  }, [canEdit, profile.id, isHero, detailRefreshing, totalCriteria, desc, runGenerateCriteria]);

  React.useEffect(() => {
    setProfile(initialProfile);
    if (isHero || !String(initialProfile.id).startsWith('REC-')) {
      setDetailRefreshing(false);
      return;
    }

    let cancelled = false;
    setDetailRefreshing(true);
    const applyJob = (job: Record<string, unknown>) => {
      const shaped = shapeJobRow(job);
      setProfile(shaped);
      const nextDesc = shaped.description || '';
      setDescState((prev) => (prev === nextDesc ? prev : nextDesc));
      if (!generatingCriteriaRef.current && !criteriaDirtyRef.current) {
        setMHState(cloneCriteriaItems(shaped.mustHave));
        setNHState(cloneCriteriaItems(shaped.niceToHave));
        setRFState(cloneCriteriaItems(shaped.redFlags));
        setScreeningModel(shaped.screeningModel || 'claude-sonnet-4-6');
      }
    };

    const load = async () => {
      try {
        const job = await api.jobs.get(initialProfile.id);
        if (!cancelled) applyJob(job as unknown as Record<string, unknown>);
      } catch {
        if (!cancelled) setProfile(initialProfile);
      }

      try {
        if (canEdit) {
          const job = await api.jobs.refreshFromRecruitee(initialProfile.id);
          if (!cancelled) applyJob(job as unknown as Record<string, unknown>);
        }
      } catch {
        // Keep list / GET data if Recruitee refresh fails.
      } finally {
        if (!cancelled) setDetailRefreshing(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [initialProfile.id, isHero, canEdit]);

  React.useEffect(() => {
    api.settings.get().then(setWorkspaceSettings).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (profile.screeningModel) return;
    if (workspaceSettings?.default_model) {
      setScreeningModel(workspaceSettings.default_model);
    }
  }, [workspaceSettings, profile.screeningModel]);

  React.useLayoutEffect(() => {
    if (criteriaDirtyRef.current || generatingCriteriaRef.current) return;
    const mh0 = cloneCriteriaItems(profile.mustHave);
    const nh0 = cloneCriteriaItems(profile.niceToHave);
    const rf0 = cloneCriteriaItems(profile.redFlags);
    const d0 = profile.description || '';
    setMHState(mh0);
    setNHState(nh0);
    setRFState(rf0);
    setDescState(d0);
    setScreeningModel(profile.screeningModel || workspaceSettings?.default_model || 'claude-sonnet-4-6');
    setShortlistStageId(profile.shortlistStageId ?? '');
    setShortlistStageName(profile.shortlistStageName ?? '');
    setSaveState({ status: 'idle', message: '' });
  }, [profile, workspaceSettings?.default_model]);

  const saveProfile = React.useCallback(async () => {
    if (!canEdit || isHero) return;
    setSaveState({ status: 'saving', message: '' });
    try {
      const criteria = buildCriteriaPayload(mh, nh, rf);
      if (criteria.length === 0) {
        setSaveState({
          status: 'error',
          message: 'Add at least one criterion (click + Add), then save.',
        });
        return;
      }
      for (const c of criteria) {
        const blocked = getProtectedAttributeError(c.name);
        if (blocked) {
          setSaveState({ status: 'error', message: blocked });
          return;
        }
      }
      await api.jobs.upsert(profile.id, {
        name: profile.name,
        dept: profile.dept,
        status: profile.status,
        source: profile.source,
        source_ref: profile.sourceRef,
        description: desc,
        screening_model: screeningModel,
        shortlist_stage_id: shortlistStageId || null,
        shortlist_stage_name: shortlistStageName || null,
        criteria,
      });
      profile.screeningModel = screeningModel;
      profile.shortlistStageId = shortlistStageId || null;
      profile.shortlistStageName = shortlistStageName || null;
      profile.mustHave = mh;
      profile.niceToHave = nh;
      profile.redFlags = rf;
      profile.description = desc;
      criteriaDirtyRef.current = false;
      clearJobsCache(userId);
      setSaveState({ status: 'saved', message: 'Saved.' });
      setTimeout(() => setSaveState({ status: 'idle', message: '' }), 2500);
    } catch (err) {
      setSaveState({ status: 'error', message: err?.message ?? 'Save failed.' });
    }
  }, [canEdit, isHero, profile, mh, nh, rf, desc, screeningModel, shortlistStageId, shortlistStageName, userId]);

  const setMH = React.useCallback((up) => {
    if (!canEdit) return;
    markCriteriaDirty();
    setMHState((prev) => {
      const next = typeof up === 'function' ? up(prev) : up;
      profile.mustHave = next;
      return next;
    });
  }, [canEdit, profile, markCriteriaDirty]);

  const setNH = React.useCallback((up) => {
    if (!canEdit) return;
    markCriteriaDirty();
    setNHState((prev) => {
      const next = typeof up === 'function' ? up(prev) : up;
      profile.niceToHave = next;
      return next;
    });
  }, [canEdit, profile, markCriteriaDirty]);

  const setRF = React.useCallback((up) => {
    if (!canEdit) return;
    markCriteriaDirty();
    setRFState((prev) => {
      const next = typeof up === 'function' ? up(prev) : up;
      profile.redFlags = next;
      return next;
    });
  }, [canEdit, profile, markCriteriaDirty]);

  const setDesc = React.useCallback((up) => {
    markCriteriaDirty();
    setDescState((prev) => {
      const next = typeof up === 'function' ? up(prev) : up;
      profile.description = next;
      return next;
    });
  }, [profile, markCriteriaDirty]);

  const fallbackRuns = [
    { id: '12052026', date: 'May 12, 2026', cvs: 38, scoreRange: [42, 91], status: 'completed', duration: '4m 12s', owner: 'You' },
    { id: '30042026', date: 'Apr 30, 2026', cvs: 24, scoreRange: [38, 87], status: 'completed', duration: '3m 04s', owner: 'Mara Achterberg' },
    { id: '18042026', date: 'Apr 18, 2026', cvs: 19, scoreRange: [45, 83], status: 'completed', duration: '2m 41s', owner: 'You' },
  ];
  const runsToShow = isHero
    ? fallbackRuns
    : runsForDisplay(profile.screeningRuns ?? []);

  const jobTitle = profile.name?.trim() || 'Untitled job';
  const runsCount = profile.runsCount || 0;

  useSetPageTitle(jobTitle, profile.dept || null);

  return (
    <div className="page job-detail-page">
      <header className="job-detail-hero">
        <button type="button" className="job-detail-back" onClick={onBack}>
          <Icon name="chevron-left" size={16} aria-hidden />
          Jobs
        </button>

        <div className="job-detail-hero__main">
          <div className="job-detail-hero__text">
            <h1 className="job-detail-hero__title">{jobTitle}</h1>
            <JobDetailMeta
              dept={profile.dept}
              postedOn={profile.postedOn}
              runsCount={runsCount}
              lastUpdated={profile.lastUpdated}
            />
            <div className="job-detail-hero__badges">
              {profile.source === 'recruitee'
                ? <Badge tone="info"><Icon name="database" size={11} aria-hidden /> Recruitee · {profile.sourceRef}</Badge>
                : <Badge tone="ghost"><Icon name="edit" size={11} aria-hidden /> Manually added</Badge>}
              <Badge tone={profile.status === 'open' ? 'ok' : 'ghost'} dot={profile.status === 'open'}>
                {profile.status === 'open' ? 'Open' : profile.status === 'closed' ? 'Closed' : 'Archived'}
              </Badge>
              <span className="job-detail-hero__id mono muted" title={profile.id}>{profile.id}</span>
            </div>
          </div>
          <div className="job-detail-hero__actions">
            <RunScreeningBtn canEdit={canEdit} onClick={() => onOpenRunSheet && onOpenRunSheet()} />
          </div>
        </div>
      </header>

      <ProfileTabs
        key={profile.id}
        profile={profile}
        canEdit={canEdit}
        initialTab={initialTab}
        desc={desc} setDesc={setDesc}
        mh={mh} setMH={setMH}
        nh={nh} setNH={setNH}
        rf={rf} setRF={setRF}
        runsToShow={runsToShow}
        showBias={showBias} setShowBias={setShowBias}
        totalCriteria={totalCriteria}
        workspaceSettings={workspaceSettings}
        screeningModel={screeningModel}
        setScreeningModel={(v) => { markCriteriaDirty(); setScreeningModel(v); }}
        shortlistStageId={shortlistStageId}
        setShortlistStageId={setShortlistStageId}
        shortlistStageName={shortlistStageName}
        setShortlistStageName={setShortlistStageName}
        markCriteriaDirty={markCriteriaDirty}
        onSaveProfile={saveProfile}
        saveState={saveState}
        isHero={isHero}
        go={go}
        onOpenRunSheet={onOpenRunSheet}
        criteriaGenState={criteriaGenState}
        onGenerateCriteria={() => {
          lastAutoCriteriaFingerprintRef.current = '';
          runGenerateCriteria('manual');
        }}
      />
    </div>
  );
}

function resolveProfileTab(initialTab) {
  if (initialTab === 'criteria') return 'criteria';
  if (['overview', 'runs', 'candidates', 'related', 'audit'].includes(initialTab)) return initialTab;
  return 'overview';
}

function ProfileTabs({
  profile, initialTab, desc, setDesc, mh, setMH, nh, setNH, rf, setRF,
  runsToShow, showBias, setShowBias, totalCriteria,
  workspaceSettings, screeningModel, setScreeningModel,
  shortlistStageId, setShortlistStageId, shortlistStageName, setShortlistStageName,
  markCriteriaDirty,
  onSaveProfile, saveState, isHero,
  go, onOpenRunSheet, criteriaGenState, onGenerateCriteria, canEdit = true,
}) {
  const [tab, setTab] = React.useState(() => resolveProfileTab(initialTab));
  const [calibration, setCalibration] = React.useState(null);

  React.useLayoutEffect(() => {
    setTab(resolveProfileTab(initialTab));
  }, [profile.id, initialTab]);

  React.useEffect(() => {
    if (tab !== 'criteria' || isHero) {
      setCalibration(null);
      return;
    }
    let cancelled = false;
    api.jobs.calibration(profile.id)
      .then((data) => { if (!cancelled) setCalibration(data); })
      .catch(() => { if (!cancelled) setCalibration(null); });
    return () => { cancelled = true; };
  }, [tab, profile.id, isHero]);

  const calibrationByCriterionId = React.useMemo(() => {
    const map = new Map();
    for (const item of calibration?.flagged ?? []) {
      map.set(item.criterion_id, item);
    }
    return map;
  }, [calibration]);

  const completedRunsForJob = React.useMemo(
    () => (profile.screeningRuns ?? []).filter((r) => r.status === 'completed'),
    [profile.screeningRuns],
  );
  const completedRunCount = completedRunsForJob.length;

  const [scoredRows, setScoredRows] = React.useState([]);
  const [scoredLoading, setScoredLoading] = React.useState(false);
  const [scoredError, setScoredError] = React.useState(null);
  const [dispositionByApplicantId, setDispositionByApplicantId] = React.useState(() => new Map());

  React.useEffect(() => {
    if (isHero || !profile?.id) {
      setScoredRows([]);
      setScoredLoading(false);
      setScoredError(null);
      setDispositionByApplicantId(new Map());
      return;
    }

    let cancelled = false;
    setScoredLoading(true);
    setScoredError(null);

    api.jobs.scoredCandidates(profile.id)
      .then(({ candidates }) => {
        if (cancelled) return;
        const dispositionMap = new Map();
        for (const c of candidates) {
          if (!c.recruitee_applicant_id || !c.disposition) continue;
          const key = String(c.recruitee_applicant_id);
          if (!dispositionMap.has(key)) {
            dispositionMap.set(key, {
              disposition: c.disposition,
              target_stage_name: c.target_stage_name,
              recruitee_sync_status: c.recruitee_sync_status,
            });
          }
        }
        setDispositionByApplicantId(dispositionMap);
        setScoredRows(
          candidates.map((c) => ({
            key: `${c.run_id}-${c.id}`,
            candidateId: c.id,
            name: c.name ?? 'Unknown',
            title: c.title ?? '—',
            loc: c.location ?? '—',
            score: c.score ?? '—',
            status: c.status ?? 'review',
            confidence: c.confidence ?? 'medium',
            runId: c.run_id,
            runDate: formatJobDate(c.run_created_at) ?? '—',
            disposition: c.disposition,
          })),
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setScoredRows([]);
          setScoredError(err?.message ?? 'Failed to load scored candidates.');
        }
      })
      .finally(() => {
        if (!cancelled) setScoredLoading(false);
      });

    return () => { cancelled = true; };
  }, [profile.id, isHero, completedRunCount]);

  const candidateRows = isHero
    ? (typeof getCandidateRowsForJob === 'function' ? getCandidateRowsForJob(profile.id) : [])
    : scoredRows;

  const initialApplicants = React.useMemo(
    () => (profile.sourceRef ? getCachedApplicants(profile.sourceRef) : null),
    [profile.sourceRef],
  );
  const [recruiteeData, setRecruiteeData] = React.useState(() => initialApplicants ?? null);
  const [recruiteeAppsLoading, setRecruiteeAppsLoading] = React.useState(
    () =>
      profile.source === 'recruitee'
      && Boolean(profile.sourceRef)
      && !(initialApplicants?.applicants?.length),
  );
  const [recruiteeAppsError, setRecruiteeAppsError] = React.useState(null);
  const [auditCount, setAuditCount] = React.useState(0);
  const [relatedCount, setRelatedCount] = React.useState(0);

  React.useEffect(() => {
    if (!profile?.id || profile.id === HERO_PROFILE.id) {
      setRelatedCount(0);
      return;
    }
    api.jobs.relatedProfiles(profile.id)
      .then((rows) => setRelatedCount(rows.length))
      .catch(() => setRelatedCount(0));
  }, [profile.id]);

  React.useEffect(() => {
    if (profile.source !== 'recruitee' || !profile.sourceRef) {
      setRecruiteeData(null);
      setRecruiteeAppsLoading(false);
      setRecruiteeAppsError(null);
      return;
    }

    let cancelled = false;
    const cached = getCachedApplicants(profile.sourceRef);
    if (cached?.applicants) {
      setRecruiteeData(cached);
      setRecruiteeAppsLoading(false);
      setRecruiteeAppsError(null);
    } else {
      setRecruiteeAppsLoading(true);
      setRecruiteeAppsError(null);
    }

    loadRecruiteeApplicants(profile.sourceRef)
      .then((data) => {
        if (!cancelled) {
          setRecruiteeData(data);
          setRecruiteeAppsError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setRecruiteeData(null);
          setRecruiteeAppsError(err?.message ?? 'Failed to load applicants from Recruitee.');
        }
      })
      .finally(() => {
        if (!cancelled) setRecruiteeAppsLoading(false);
      });

    return () => { cancelled = true; };
  }, [profile.id, profile.sourceRef, profile.source]);

  const recruiteeApps = recruiteeData?.applicants ?? [];

  const candidatesTabCount = profile.source === 'recruitee' && recruiteeApps.length > 0
    ? recruiteeApps.length
    : (candidateRows.length > 0 ? candidateRows.length : (profile.applicantsCount ?? 0));

  return (
    <>
      <JobTabNav
        activeTab={tab}
        onTabChange={setTab}
        hiddenTabs={[]}
        counts={{
          criteria: totalCriteria > 0 ? totalCriteria : null,
          runs: completedRunCount > 0 ? completedRunCount : null,
          candidates: candidatesTabCount > 0 ? candidatesTabCount : null,
          related: relatedCount > 0 ? relatedCount : null,
          audit: auditCount > 0 ? auditCount : null,
        }}
      />

      {tab === 'overview' && (
        <OverviewPane
          profile={profile}
          desc={desc}
          setDesc={setDesc}
          savedMustHave={profile.mustHave}
          savedNiceToHave={profile.niceToHave}
          savedRedFlags={profile.redFlags}
          screeningModel={screeningModel}
          runsToShow={runsToShow}
          go={go}
          canEdit={canEdit}
          onGoToCriteria={() => setTab('criteria')}
        />
      )}
      {tab === 'criteria' && (
        <CriteriaPane
          profile={profile}
          mh={mh} setMH={setMH} nh={nh} setNH={setNH} rf={rf} setRF={setRF}
          showBias={showBias} setShowBias={setShowBias}
          workspaceSettings={workspaceSettings}
          screeningModel={screeningModel}
          setScreeningModel={setScreeningModel}
          shortlistStageId={shortlistStageId}
          setShortlistStageId={setShortlistStageId}
          shortlistStageName={shortlistStageName}
          setShortlistStageName={setShortlistStageName}
          onSave={onSaveProfile}
          saveState={saveState}
          isHero={isHero}
          canEdit={canEdit}
          criteriaGenState={criteriaGenState}
          onGenerateCriteria={onGenerateCriteria}
          hasUsableDescription={isUsableJobDescription(desc)}
          calibration={calibration}
          calibrationByCriterionId={calibrationByCriterionId}
          markCriteriaDirty={markCriteriaDirty}
        />
      )}
      {tab === 'runs'     && <RunsPane runs={runsToShow} go={go} onOpenRunSheet={onOpenRunSheet} canEdit={canEdit}/>}
      {tab === 'candidates' && (
        <JobCandidatesPane
          profile={profile}
          rows={candidateRows}
          recruiteeData={recruiteeData}
          recruiteeLoading={recruiteeAppsLoading}
          recruiteeError={recruiteeAppsError}
          scoredLoading={scoredLoading}
          scoredError={scoredError}
          completedRuns={completedRunsForJob}
          dispositionByApplicantId={dispositionByApplicantId}
          go={go}
          canEdit={canEdit}
          onOpenRunSheet={onOpenRunSheet}
        />
      )}
      {tab === 'audit' && (
        <AuditPane
          jobId={profile.id}
          isHero={isHero}
          active={tab === 'audit'}
          canEdit={canEdit}
          onCount={setAuditCount}
          go={go}
        />
      )}
      {tab === 'related' && (
        <RelatedProfilesPane
          jobId={profile.id}
          jobName={profile.name}
          hasDescription={Boolean(desc?.trim())}
          isHero={isHero}
          canEdit={canEdit}
          workspaceSettings={workspaceSettings}
          screeningModel={screeningModel}
          onProfilesChange={setRelatedCount}
          onGoToOverview={() => setTab('overview')}
        />
      )}
    </>
  );
}
const AUDIT_KIND_META = {
  criteria: { icon: 'sliders', label: 'Criteria' },
  run: { icon: 'play', label: 'Screening' },
  override: { icon: 'edit', label: 'Override' },
  candidate: { icon: 'users', label: 'Candidate' },
  job: { icon: 'doc', label: 'Job' },
  sync: { icon: 'database', label: 'Recruitee' },
  other: { icon: 'history', label: 'Activity' },
};

/* ----- Audit pane ----- */
function AuditPane({ jobId, isHero, active, onCount, go, canEdit = true }) {
  const [entries, setEntries] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const loadAudit = React.useCallback(() => {
    if (isHero || !jobId) {
      setEntries([]);
      onCount?.(0);
      setLoading(false);
      return () => {};
    }

    let cancelled = false;
    setLoading(true);
    api.jobs
      .audit(jobId)
      .then((rows) => {
        if (cancelled) return;
        setEntries(rows);
        onCount?.(rows.length);
      })
      .catch(() => {
        if (cancelled) return;
        setEntries([]);
        onCount?.(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [jobId, isHero, onCount]);

  React.useEffect(() => {
    if (!active) return undefined;
    return loadAudit();
  }, [active, loadAudit]);

  return (
    <JobsPanel
      icon="list"
      title="Activity log"
      sub={loading ? 'Loading…' : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}
      actions={!loading && entries.length > 0 ? <Btn size="sm" variant="ghost" onClick={loadAudit}>Refresh</Btn> : null}
      flush
    >
        {loading && (
          <div className="jobs-skeleton" role="status">Loading activity…</div>
        )}
        {!loading && entries.length === 0 && (
          <PageEmpty
            icon="history"
            title="No activity yet"
            description={canEdit
              ? 'Saving criteria, running screening, and overriding scores on this job are recorded here automatically.'
              : 'Activity from editors and admins on this job appears here once changes are made.'}
          />
        )}
        {!loading && entries.length > 0 && (
          <div className="log">
            {entries.map((a) => {
              const meta = AUDIT_KIND_META[a.kind] ?? AUDIT_KIND_META.other;
              return (
                <div key={a.id} className={`log__row log__row--${a.kind}`}>
                  <div className="log__ts">{a.ts}</div>
                  <div className="log__main">
                    <div className="log__kind">
                      <Icon name={meta.icon} size={12} className="muted"/>
                      <span>{meta.label}</span>
                    </div>
                    <div className="log__msg">
                      <b>{a.who}</b> {a.msg}
                      {a.warned && (
                        <Badge tone="warn" style={{ marginLeft: 8, verticalAlign: 'middle' }}>
                          Bias criteria
                        </Badge>
                      )}
                    </div>
                    {a.reason !== '—' && (
                      <div className="log__reason muted">Reason: {a.reason}</div>
                    )}
                    {a.runId && go && (a.kind === 'run' || a.kind === 'override') && (
                      <button
                        type="button"
                        className="linkish log__link"
                        onClick={() => go('results', a.runId)}
                      >
                        View run →
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </JobsPanel>
  );
}

export { ProfileEditor }
