// @ts-nocheck
// Page 4 — Jobs library + editor (each row is one open role / announcement).
// Primary screening path: Run screening sheet (CVs + review) from a job.
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { PROFILES, RECRUITEE_JOBS } from '@/caliper/data'
import { api } from '@/services/api'
import { prefetchRecruiteeApplicants } from '@/lib/applicants-cache'
import {
  loadJobs,
  readJobsCache,
  shouldRunRecruiteeSync,
} from '@/lib/jobs-cache'
import { useAuth } from '@/contexts/AuthContext'
import { JobsListView } from '@/caliper/components/jobs/JobsListView'
import { RunScreeningSheet } from '@/caliper/components/run/RunScreeningSheet'

import {
  shapeJobsList,
  sortJobProfiles,
  cycleJobTableSort,
  getCriteriaListsForProfile,
} from '@/caliper/components/jobs/jobs-utils'
import {
  Icon,
  Btn,
  IconBtn,
  Segmented,
  Field,
} from '@/caliper/ui'
import { JobsPageLoading } from '@/caliper/pages/profiles/JobsPageLoading'
import { AppToast, useToast } from '@/caliper/components/AppToast'

const LazyProfileEditor = React.lazy(() =>
  import('@/caliper/components/jobs/ProfileEditor').then((m) => ({ default: m.ProfileEditor })),
);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function HighlightMatches({ text, query }) {
  const q = query.trim();
  if (!q || text == null || text === '') return text;
  const parts = String(text).split(new RegExp(`(${escapeRegExp(q)})`, 'gi'));
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1
      ? <mark key={i} className="job-picker-hit">{part}</mark>
      : part,
  );
}

function PickJobToRunModal({ onClose, onPick, profiles }) {
  const [query, setQuery] = React.useState('');
  const searchRef = React.useRef(null);

  React.useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const filteredProfiles = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = profiles ?? [];
    if (!q) return list;
    return list.filter((p) =>
      p.name.toLowerCase().includes(q)
      || p.id.toLowerCase().includes(q)
      || (p.dept && p.dept.toLowerCase().includes(q)),
    );
  }, [profiles, query]);

  return (
    <div className="detail" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 92vw)',
          alignSelf: 'center',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-lg)',
          margin: 'auto',
          boxShadow: 'var(--shadow-pop)',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 500 }}>Run screening for…</h3>
          <div className="spacer"/>
          <IconBtn name="x" size={14} onClick={onClose}/>
        </div>
        <div
          style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ position: 'relative' }}>
            <input
              ref={searchRef}
              className="inp"
              placeholder="Search jobs by title…"
              style={{ paddingLeft: 32, width: '100%' }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search jobs"
            />
            <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--muted)' }}/>
          </div>
        </div>
        <div style={{ overflowY: 'auto', padding: 8 }}>
          {filteredProfiles.length === 0 ? (
            <div className="muted" style={{ padding: '18px 14px', fontSize: 12.5 }}>
              No jobs match your search.
            </div>
          ) : filteredProfiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '12px 14px', border: 0, background: 'transparent',
                borderRadius: 8, cursor: 'default',
                borderBottom: '1px solid var(--line-soft)',
              }}
            >
              <div style={{ fontWeight: 500 }}><HighlightMatches text={p.name} query={query} /></div>
              <div className="muted mono" style={{ fontSize: 11, marginTop: 2 }}>
                <HighlightMatches text={p.id} query={query} />
                {' · '}
                <HighlightMatches text={p.dept} query={query} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function allocNewProfileId() {
  const base = Date.now().toString(36).toUpperCase();
  let id = `PROF-${base}`;
  if (!PROFILES.some((p) => p.id === id)) return id;
  return `PROF-${base}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function buildProfileFromRecruiteeJob(job) {
  const postedOn = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const lastUpdated = postedOn;
  const dept = job.department ?? job.dept ?? 'General';
  const description = `Imported from Recruitee — ${job.title} (${dept}).\n\nEdit the overview to add the full job description and screening criteria.`;
  return {
    id: `REC-${job.id}`,
    name: job.title,
    dept,
    source: 'recruitee',
    sourceRef: job.id,
    status: 'open',
    postedOn,
    description,
    runsCount: 0,
    lastRun: null,
    lastUpdated,
    mustHave: [],
    niceToHave: [],
    redFlags: [],
  };
}

function buildManualProfile(title, descText) {
  const postedOn = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return {
    id: allocNewProfileId(),
    name: title.trim(),
    dept: 'General',
    source: 'manual',
    status: 'open',
    postedOn,
    description: descText.trim(),
    runsCount: 0,
    lastRun: null,
    lastUpdated: postedOn,
    mustHave: [],
    niceToHave: [],
    redFlags: [],
  };
}

function ProfilesPage({ go, route }) {
  const navigate = useNavigate();
  const { canEdit, user } = useAuth();
  const { toast, showToast, dismissToast } = useToast();
  const userId = user?.sub ?? null;
  const activeJobId = route?.jobId ?? null;
  const initialCache = React.useMemo(() => readJobsCache(userId), [userId]);
  const [editorInitialTab, setEditorInitialTab] = React.useState(null);
  const [refreshToken, setRefreshToken] = React.useState({ n: 0, forceSync: false });
  const [showNew, setShowNew] = React.useState(false);
  const [filter, setFilter] = React.useState('all');
  const [departmentFilter, setDepartmentFilter] = React.useState('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [jobTableSort, setJobTableSort] = React.useState(null);
  const [runSheetProfileId, setRunSheetProfileId] = React.useState(null);
  const [runSheetStage, setRunSheetStage] = React.useState(null);
  const [showRunPicker, setShowRunPicker] = React.useState(false);
  const [liveProfiles, setLiveProfiles] = React.useState(() =>
    initialCache?.jobs?.length ? shapeJobsList(initialCache.jobs) : null,
  );
  const [profilesLoading, setProfilesLoading] = React.useState(!initialCache?.jobs?.length);
  const [profilesLoadError, setProfilesLoadError] = React.useState(null);
  const [loadPhase, setLoadPhase] = React.useState('Syncing open roles from Recruitee…');
  const [backgroundRefreshing, setBackgroundRefreshing] = React.useState(
    Boolean(initialCache?.jobs?.length),
  );

  const refreshProfiles = React.useCallback((opts?: { forceSync?: boolean }) => {
    setRefreshToken((t) => ({ n: t.n + 1, forceSync: Boolean(opts?.forceSync) }));
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const hadList = liveProfiles !== null;
    const cache = readJobsCache(userId);
    const needsSync = shouldRunRecruiteeSync(
      cache?.lastSyncAt ?? null,
      refreshToken.forceSync,
    );

    if (!userId) return;

    if (!hadList) {
      setProfilesLoading(true);
      setProfilesLoadError(null);
      setLiveProfiles(null);
      setLoadPhase(canEdit && needsSync ? 'Syncing open roles from Recruitee…' : 'Loading your job list…');
    } else {
      setBackgroundRefreshing(true);
    }

    loadJobs({ forceSync: refreshToken.forceSync, userId, allowRecruiteeSync: canEdit })
      .then((entry) => {
        if (cancelled) return;
        setLiveProfiles(shapeJobsList(entry.jobs));
        setProfilesLoadError(null);
      })
      .catch((err) => {
        if (!cancelled && !hadList) {
          setLiveProfiles(null);
          setProfilesLoadError(err?.message ?? 'Failed to load jobs.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setProfilesLoading(false);
          setBackgroundRefreshing(false);
        }
      });

    return () => { cancelled = true; };
  }, [refreshToken.n, refreshToken.forceSync, userId, canEdit]);

  const jobs = liveProfiles ?? [];
  const departmentOptions = React.useMemo(
    () => [...new Set(jobs.map((p) => p.dept).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [jobs],
  );
  const hasUnassignedDepts = jobs.some((p) => !p.dept);

  React.useEffect(() => {
    if (departmentFilter === 'all') return;
    if (departmentFilter === '__unassigned__') {
      if (hasUnassignedDepts) return;
      setDepartmentFilter('all');
      return;
    }
    if (departmentOptions.includes(departmentFilter)) return;
    setDepartmentFilter('all');
  }, [departmentFilter, departmentOptions, hasUnassignedDepts]);
  const profile = activeJobId && liveProfiles ? liveProfiles.find((p) => p.id === activeJobId) : null;

  const screenJobId = route?.screenJobId ?? null;
  const deepLinkTab = route?.deepLinkTab ?? null;

  const mapDeepLinkTab = (tab) => {
    if (!tab) return null;
    const t = String(tab).toLowerCase();
    if (t === 'applicants' || t === 'candidates') return 'candidates';
    if (['overview', 'criteria', 'runs', 'related', 'audit'].includes(t)) return t;
    return null;
  };

  React.useEffect(() => {
    if (!liveProfiles?.length) return;

    const clearParams = () => {
      if (route?.clearSearchParams) route.clearSearchParams();
    };

    if (screenJobId && !canEdit) {
      showToast({ message: 'View-only — editors and admins can run screening.', tone: 'default' });
      clearParams();
      return;
    }

    if (screenJobId && canEdit && liveProfiles.some((p) => p.id === screenJobId)) {
      setRunSheetProfileId(screenJobId);
      clearParams();
      return;
    }

    if (!activeJobId || !liveProfiles.some((p) => p.id === activeJobId)) return;

    const job = liveProfiles.find((p) => p.id === activeJobId);
    if (!job) return;

    if (job.source === 'recruitee' && job.sourceRef) {
      prefetchRecruiteeApplicants(job.sourceRef);
    }

    setRunSheetProfileId(null);

    const mappedTab = mapDeepLinkTab(deepLinkTab);
    if (mappedTab) setEditorInitialTab(mappedTab);
    else {
      const lists = getCriteriaListsForProfile(job);
      const criteriaCount = lists.must.length + lists.nice.length + lists.flag.length;
      setEditorInitialTab(criteriaCount === 0 ? 'criteria' : null);
    }

    if (deepLinkTab || route?.clearSearchParams) clearParams();
  }, [activeJobId, screenJobId, deepLinkTab, liveProfiles, route, canEdit, showToast]);

  if (profile) {
    return (
      <>
        <React.Suspense fallback={<JobsPageLoading phase="Loading job…" />}>
          <LazyProfileEditor
          profile={profile}
          initialTab={editorInitialTab}
          canEdit={canEdit}
          onBack={() => {
            setRunSheetProfileId(null);
            setEditorInitialTab(null);
            navigate('/jobs');
          }}
          go={go}
          onOpenRunSheet={(stage) => { setRunSheetStage(stage ?? null); setRunSheetProfileId(profile.id); }}
          />
        </React.Suspense>
        {canEdit && runSheetProfileId === profile.id && (
          <RunScreeningSheet
            key={`${profile.id}-${runSheetStage ?? 'all'}`}
            profile={profile}
            initialStage={runSheetStage}
            onClose={() => { setRunSheetStage(null); setRunSheetProfileId(null); }}
            go={go}
            onEditCriteria={() => {
              setRunSheetProfileId(null);
              setEditorInitialTab('criteria');
            }}
          />
        )}
        <AppToast toast={toast} onDismiss={dismissToast} />
      </>
    );
  }

  if (profilesLoading || liveProfiles === null) {
    return <JobsPageLoading phase={loadPhase} />;
  }

  if (profilesLoadError) {
    return (
      <JobsPageLoading
        phase={profilesLoadError}
        onRetry={() => refreshProfiles()}
      />
    );
  }

  const runSheetProfile = runSheetProfileId ? jobs.find((p) => p.id === runSheetProfileId) : null;

  const filtered = jobs.filter(p => {
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const haystack = [
        p.name,
        p.id,
        p.dept,
        p.source,
        p.sourceRef,
      ].map((v) => (v ?? '').toLowerCase());
      if (!haystack.some((s) => s.includes(q))) return false;
    }
    if (departmentFilter === '__unassigned__') {
      if (p.dept) return false;
    } else if (departmentFilter !== 'all' && p.dept !== departmentFilter) return false;
    if (filter === 'all') return true;
    if (filter === 'open') return p.status === 'open';
    if (filter === 'closed') return p.status === 'closed' || p.status === 'archived';
    if (filter === 'recruitee') return p.source === 'recruitee';
    if (filter === 'manual') return p.source === 'manual';
    return true;
  });

  const visibleJobs = sortJobProfiles(filtered, jobTableSort);

  const cycleJobSort = (key) => {
    setJobTableSort((prev) => cycleJobTableSort(prev, key));
  };

  return (
    <>
      <JobsListView
        jobs={jobs}
        filtered={filtered}
        visibleJobs={visibleJobs}
        jobTableSort={jobTableSort}
        onSort={cycleJobSort}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filter={filter}
        onFilterChange={setFilter}
        departmentFilter={departmentFilter}
        departmentOptions={departmentOptions}
        hasUnassignedDepts={hasUnassignedDepts}
        onDepartmentFilterChange={setDepartmentFilter}
        canEdit={canEdit}
        backgroundRefreshing={backgroundRefreshing}
        onRefresh={refreshProfiles}
        onNewJob={() => setShowNew(true)}
        onRunPicker={() => setShowRunPicker(true)}
        navigate={navigate}
      />

      {canEdit && showNew && (
        <NewProfileDialog
          profiles={jobs}
          onClose={() => setShowNew(false)}
          onCreate={(newProfile) => {
            const body = {
              name: newProfile.name,
              dept: newProfile.dept,
              status: newProfile.status,
              source: newProfile.source,
              source_ref: newProfile.sourceRef,
              description: newProfile.description,
              posted_on: newProfile.postedOn,
            };
            api.jobs.upsert(newProfile.id, body)
              .then(() => refreshProfiles())
              .catch((e) => setProfilesLoadError(e?.message ?? 'Failed to create job.'));
            setShowNew(false);
            setEditorInitialTab('criteria');
            navigate(`/jobs/${encodeURIComponent(newProfile.id)}?tab=criteria`);
          }}
        />
      )}
      {canEdit && showRunPicker && (
        <PickJobToRunModal
          profiles={jobs}
          onClose={() => setShowRunPicker(false)}
          onPick={(id) => {
            setShowRunPicker(false);
            setRunSheetStage(null);
            setRunSheetProfileId(id);
          }}
        />
      )}
      {canEdit && runSheetProfile && (
        <RunScreeningSheet
          key={`${runSheetProfile.id}-${runSheetStage ?? 'all'}`}
          profile={runSheetProfile}
          initialStage={runSheetStage}
          onClose={() => { setRunSheetStage(null); setRunSheetProfileId(null); }}
          go={go}
          onEditCriteria={() => {
            const jobId = runSheetProfileId;
            setRunSheetProfileId(null);
            navigate(`/jobs/${encodeURIComponent(jobId)}?tab=criteria`);
          }}
        />
      )}
      <AppToast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
function NewProfileDialog({ onClose, onCreate, profiles }) {
  const [mode, setMode] = React.useState('recruitee');
  const [picked, setPicked] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [desc, setDesc] = React.useState('');
  const [liveRecruiteeJobs, setLiveRecruiteeJobs] = React.useState(null);

  React.useEffect(() => {
    if (mode !== 'recruitee') return;
    api.recruitee.jobs()
      .then(setLiveRecruiteeJobs)
      .catch(() => setLiveRecruiteeJobs([]));
  }, [mode]);

  const recruiteeRefsInCaliper = React.useMemo(
    () => new Set((profiles ?? PROFILES).filter((p) => p.source === 'recruitee' && p.sourceRef).map((p) => p.sourceRef)),
    [profiles],
  );
  const allRecruiteeJobs = liveRecruiteeJobs ?? RECRUITEE_JOBS;
  const recruiteeChoices = React.useMemo(
    () => allRecruiteeJobs.filter((j) => !recruiteeRefsInCaliper.has(j.id)),
    [allRecruiteeJobs, recruiteeRefsInCaliper],
  );

  React.useEffect(() => {
    if (mode !== 'recruitee') return;
    if (picked && recruiteeRefsInCaliper.has(picked)) setPicked('');
  }, [mode, picked, recruiteeRefsInCaliper]);

  const canSubmitRecruitee = Boolean(picked && recruiteeChoices.some((j) => j.id === picked));
  const canSubmitManual = title.trim().length > 0 && desc.trim().length > 0;
  const canSubmit = mode === 'recruitee' ? canSubmitRecruitee : canSubmitManual;

  const submit = () => {
    if (!onCreate || !canSubmit) return;
    if (mode === 'recruitee') {
      const job = allRecruiteeJobs.find((j) => j.id === picked);
      if (!job || recruiteeRefsInCaliper.has(job.id)) return;
      onCreate(buildProfileFromRecruiteeJob(job));
      return;
    }
    onCreate(buildManualProfile(title, desc));
  };

  return (
    <div className="detail" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
           style={{
             width: 'min(640px, 92vw)',
             alignSelf: 'center',
             background: 'var(--surface)',
             border: '1px solid var(--line)',
             borderRadius: 'var(--radius-lg)',
             margin: 'auto',
             boxShadow: 'var(--shadow-pop)',
             maxHeight: '88vh',
             display: 'flex', flexDirection: 'column',
           }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 500, letterSpacing: '-0.005em' }}>
            New job
          </h3>
          <div className="spacer"/>
          <IconBtn name="x" size={14} onClick={onClose}/>
        </div>
        <div style={{ padding: 22, overflowY: 'auto' }}>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
            Each job is one open role. Pull from your Recruitee career portal, or add one manually for internal-only postings.
          </div>
          <Segmented value={mode} onChange={setMode} options={[
            { value: 'recruitee', label: 'Fetch from Recruitee' },
            { value: 'manual',    label: 'Add manually' },
          ]}/>

          {mode === 'recruitee' ? (
            <div className="col" style={{ marginTop: 18, gap: 12 }}>
              <Field label="Open positions" hint="Jobs already in Caliper are hidden.">
                <select className="sel" value={picked} onChange={(e) => setPicked(e.target.value)}>
                  <option value="">
                    {recruiteeChoices.length ? 'Select a position to import…' : 'No new positions — all listed roles are already in Caliper'}
                  </option>
                  {recruiteeChoices.map((j) =>
                    <option key={j.id} value={j.id}>{j.title} — {j.dept ?? 'General'} ({j.applicants_count ?? j.apps ?? 0} applicants)</option>
                  )}
                </select>
              </Field>
              {picked && (
                <div className="callout">
                  Title and description will be imported from Recruitee. Add criteria on the job&apos;s <strong>Criteria</strong> tab after creating it.
                </div>
              )}
            </div>
          ) : (
            <div className="col" style={{ marginTop: 18, gap: 14 }}>
              <Field label="Job title">
                <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)}
                       placeholder="e.g. Senior Talent Partner, EMEA"/>
              </Field>
              <Field label="Job description" hint="Paste the full text. Add criteria on this job's Criteria tab after it is created.">
                <textarea className="ta" rows={8} value={desc} onChange={(e) => setDesc(e.target.value)}
                          placeholder="What the role does, who it reports to, what the team looks like…"/>
              </Field>
            </div>
          )}
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between' }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" iconRight="chevron-right" disabled={!canSubmit} onClick={submit}>
            Create job &amp; add criteria
          </Btn>
        </div>
      </div>
    </div>
  );
}


export default ProfilesPage;
