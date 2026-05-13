// @ts-nocheck
// Mock data for the CV Screening platform
// Realistic-sounding but obviously fictional. All names invented.

/** Screening run id: calendar date only, DDMMYYYY (no prefix). */
function formatRunIdFromDate(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) {
    const digits = String(input).replace(/\D/g, '');
    return digits.length >= 8 ? digits.slice(0, 8) : '01012000';
  }
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}${mm}${yyyy}`;
}

/** Session key for demo run payload (see ProfilesPage run sheet). */
export const DEMO_RUN_SESSION_KEY = 'caliper.demoRunSession';

const RUNS = [
  {
    id: formatRunIdFromDate('May 12, 2026'),
    job: 'Senior Talent Partner, EMEA',
    dept: 'People',
    date: 'May 12, 2026',
    cvs: 38,
    scoreRange: [42, 91],
    duration: '4m 12s',
    status: 'completed',
    profile: 'Senior Talent Partner, EMEA',
    profileId: 'PROF-2841',
    owner: 'You',
    isHero: true,
  },
  {
    id: formatRunIdFromDate('May 11, 2026'),
    job: 'Staff Backend Engineer, Payments',
    dept: 'Engineering',
    date: 'May 11, 2026',
    cvs: 64,
    scoreRange: [28, 88],
    duration: '6m 50s',
    status: 'completed',
    profile: 'Staff Backend Engineer, Payments',
    profileId: 'PROF-2839',
    owner: 'Mara Achterberg',
  },
  {
    id: formatRunIdFromDate('May 09, 2026'),
    job: 'Lead Product Designer',
    dept: 'Design',
    date: 'May 09, 2026',
    cvs: 22,
    scoreRange: [51, 84],
    duration: '2m 41s',
    status: 'completed',
    profile: 'Lead Product Designer',
    profileId: 'PROF-2837',
    owner: 'You',
  },
  {
    id: formatRunIdFromDate('May 08, 2026'),
    job: 'Customer Success Manager, DACH',
    dept: 'GTM',
    date: 'May 08, 2026',
    cvs: 51,
    scoreRange: null,
    duration: '—',
    status: 'in_progress',
    progress: 62,
    profile: 'Customer Success Manager, DACH',
    profileId: 'PROF-2836',
    owner: 'Idris Park',
  },
  {
    id: formatRunIdFromDate('May 07, 2026'),
    job: 'Site Reliability Engineer II',
    dept: 'Engineering',
    date: 'May 07, 2026',
    cvs: 17,
    scoreRange: [44, 79],
    duration: '1m 58s',
    status: 'completed',
    profile: 'Site Reliability Engineer II',
    profileId: 'PROF-M021',
    owner: 'You',
  },
  {
    id: formatRunIdFromDate('May 06, 2026'),
    job: 'Recruiting Coordinator',
    dept: 'People',
    date: 'May 06, 2026',
    cvs: 89,
    scoreRange: null,
    duration: '—',
    status: 'failed',
    error: 'Recruitee token expired',
    profile: 'Recruiting Coordinator (internal-only)',
    profileId: 'PROF-M019',
    owner: 'Mara Achterberg',
  },
  {
    id: formatRunIdFromDate('May 04, 2026'),
    job: 'Engineering Manager, Platform',
    dept: 'Engineering',
    date: 'May 04, 2026',
    cvs: 31,
    scoreRange: [38, 87],
    duration: '3m 24s',
    status: 'completed',
    profile: 'Engineering Manager, Platform',
    profileId: 'PROF-2834',
    owner: 'You',
  },
  {
    id: formatRunIdFromDate('May 02, 2026'),
    job: 'Content Marketing Lead',
    dept: 'Marketing',
    date: 'May 02, 2026',
    cvs: 44,
    scoreRange: [33, 81],
    duration: '4m 02s',
    status: 'completed',
    profile: 'Content Marketing Lead',
    profileId: 'PROF-2812',
    owner: 'Idris Park',
  },
];

// In mock data, `PROFILES` / `run.profile` are the job records (title + rubric + runs).

const HERO_PROFILE = {
  id: 'PROF-2841',
  name: 'Senior Talent Partner, EMEA',
  dept: 'People',
  source: 'recruitee',      // 'recruitee' | 'manual'
  sourceRef: 'rec-2841',
  status: 'open',           // 'open' | 'closed' | 'archived'
  postedOn: 'Apr 24, 2026',
  description: `We're hiring a Senior Talent Partner to own senior-IC and leadership hiring across our EMEA hubs (Amsterdam, Berlin, Lisbon, London). You'll partner directly with hiring managers in Engineering, Product, and Design — running structured loops, calibrating panels, and using data to refine where our funnels lose great candidates.

You'll inherit a healthy ATS (Recruitee) and a working rubric, but the bar is going up: we want someone who has lived through scaling a TA function past 100 hires/year, knows what an unhealthy pipeline looks like before the numbers tell you, and can push back on a hiring manager when the brief drifts.`,
  runsCount: 3,
  lastRun: 'May 12, 2026',
  lastUpdated: 'Apr 28, 2026',
  mustHave: [
    { id: 'm1', name: '5+ years in-house tech recruiting', weight: 5 },
    { id: 'm2', name: '500+ full-cycle interviews conducted', weight: 5 },
    { id: 'm3', name: 'EMEA market experience (multi-country)', weight: 4 },
    { id: 'm4', name: 'Owned senior IC or leadership pipelines', weight: 4 },
    { id: 'm5', name: 'Comfortable with ATS data + reporting', weight: 3 },
  ],
  niceToHave: [
    { id: 'n1', name: 'Recruitee or Greenhouse power user', weight: 3 },
    { id: 'n2', name: 'Built or revised a hiring rubric / scorecard', weight: 4 },
    { id: 'n3', name: 'Worked at <500-person company', weight: 2 },
    { id: 'n4', name: 'German or French working proficiency', weight: 2 },
  ],
  redFlags: [
    { id: 'r1', name: 'No experience with technical roles', weight: 5 },
    { id: 'r2', name: 'Agency-only background, no in-house', weight: 3 },
    { id: 'r3', name: 'Frequent <12-month tenures', weight: 2, biased: true },
  ],
};

const PROFILES = [
  HERO_PROFILE,
  { id: 'PROF-2839', name: 'Staff Backend Engineer, Payments', dept: 'Engineering', source: 'recruitee', sourceRef: 'rec-2839', status: 'open',     postedOn: 'May 02, 2026', runsCount: 2, lastRun: 'May 11, 2026', lastUpdated: 'May 10, 2026', mustHave: [], niceToHave: [], redFlags: [] },
  { id: 'PROF-2837', name: 'Lead Product Designer',           dept: 'Design',      source: 'recruitee', sourceRef: 'rec-2837', status: 'open',     postedOn: 'Apr 18, 2026', runsCount: 1, lastRun: 'May 09, 2026', lastUpdated: 'Apr 22, 2026', mustHave: [], niceToHave: [], redFlags: [] },
  { id: 'PROF-2836', name: 'Customer Success Manager, DACH',  dept: 'GTM',         source: 'recruitee', sourceRef: 'rec-2836', status: 'open',     postedOn: 'Apr 14, 2026', runsCount: 1, lastRun: 'May 08, 2026', lastUpdated: 'Apr 18, 2026', mustHave: [], niceToHave: [], redFlags: [] },
  { id: 'PROF-2834', name: 'Engineering Manager, Platform',   dept: 'Engineering', source: 'recruitee', sourceRef: 'rec-2834', status: 'open',     postedOn: 'Apr 08, 2026', runsCount: 1, lastRun: 'May 04, 2026', lastUpdated: 'Apr 04, 2026', mustHave: [], niceToHave: [], redFlags: [] },
  { id: 'PROF-M021', name: 'Site Reliability Engineer II',    dept: 'Engineering', source: 'manual',                              status: 'open',     postedOn: 'Apr 30, 2026', runsCount: 1, lastRun: 'May 07, 2026', lastUpdated: 'Apr 30, 2026', mustHave: [], niceToHave: [], redFlags: [] },
  { id: 'PROF-M019', name: 'Recruiting Coordinator (internal-only)', dept: 'People', source: 'manual',                          status: 'open',     postedOn: 'Apr 22, 2026', runsCount: 1, lastRun: 'May 06, 2026', lastUpdated: 'Mar 30, 2026', mustHave: [], niceToHave: [], redFlags: [] },
  { id: 'PROF-2812', name: 'Content Marketing Lead',          dept: 'Marketing',   source: 'recruitee', sourceRef: 'rec-2812', status: 'closed',   postedOn: 'Mar 14, 2026', runsCount: 2, lastRun: 'May 02, 2026', lastUpdated: 'Mar 02, 2026', mustHave: [], niceToHave: [], redFlags: [] },
  { id: 'PROF-2798', name: 'Senior iOS Engineer',             dept: 'Engineering', source: 'recruitee', sourceRef: 'rec-2798', status: 'closed',   postedOn: 'Feb 28, 2026', runsCount: 4, lastRun: 'Apr 22, 2026', lastUpdated: 'Mar 14, 2026', mustHave: [], niceToHave: [], redFlags: [] },
];

// Candidates for the hero run
const CANDIDATES = [
  {
    id: 'c1', name: 'Tanvi Ramaswamy', title: 'Senior Talent Partner @ Hexagonal', loc: 'Amsterdam, NL',
    score: 91, must: 5, nice: 3, flag: 0,
    confidence: 'high', status: 'strong',
    summary: 'Multi-country EMEA generalist with deep tech-IC pipeline experience. Owned executive search at two scale-ups.',
  },
  {
    id: 'c2', name: 'Joaquin Pereira-Vidal', title: 'Talent Lead @ Stoa Studios', loc: 'Lisbon, PT',
    score: 87, must: 5, nice: 2, flag: 0,
    confidence: 'high', status: 'strong',
    summary: 'Six years in-house, ran EMEA hiring across PT/ES/DE. Built the rubric used by the entire TA team.',
  },
  {
    id: 'c3', name: 'Esther Kowalski', title: 'Senior Recruiter @ Klar', loc: 'Berlin, DE',
    score: 82, must: 4, nice: 3, flag: 0,
    confidence: 'high', status: 'promising',
    summary: 'Native German, French B2. Owned engineering and design pipelines for 3 years. Quote count strong.',
  },
  {
    id: 'c4', name: 'Yusuf Demirel', title: 'Tech Recruiter @ Northwind', loc: 'Istanbul, TR',
    score: 76, must: 4, nice: 2, flag: 0,
    confidence: 'medium', status: 'promising',
    summary: 'Strong technical recruiting, less senior-IC track record. EMEA coverage limited to UK + DE.',
  },
  {
    id: 'c5', name: 'Linnea Aalto', title: 'In-house Recruiter @ Snitt', loc: 'Helsinki, FI',
    score: 71, must: 3, nice: 4, flag: 0,
    confidence: 'medium', status: 'promising',
    summary: 'Hiring rubric builder, ATS data specialist. Interview volume on the lower end of the bar.',
  },
  {
    id: 'c6', name: 'Marcus Oduya', title: 'Recruitment Partner @ Bramble', loc: 'London, UK',
    score: 68, must: 3, nice: 3, flag: 0,
    confidence: 'high', status: 'promising',
    summary: 'Excellent reporting and stakeholder management. Lighter on senior IC pipelines specifically.',
  },
  {
    id: 'c7', name: 'Cosima Brandt', title: 'Talent Partner @ Roan Health', loc: 'Munich, DE',
    score: 64, must: 3, nice: 2, flag: 0,
    confidence: 'low', status: 'review',
    summary: 'CV had two scanned pages — some criteria inferred from context rather than direct quotes.',
    parseWarning: 'Pages 2–3 scanned, OCR low-confidence',
  },
  {
    id: 'c8', name: 'Ahmed El-Sharawy', title: 'Recruiting Manager @ Zenway', loc: 'Cairo, EG',
    score: 59, must: 2, nice: 3, flag: 0,
    confidence: 'medium', status: 'promising',
    summary: 'Strong agency background, limited in-house tenure. EMEA experience genuine but UK-centric.',
  },
  {
    id: 'c9', name: 'Priya Aaltola', title: 'Senior Recruiter @ Trifecta', loc: 'Stockholm, SE',
    score: 54, must: 2, nice: 3, flag: 1,
    confidence: 'medium', status: 'flagged',
    summary: 'Flagged: agency-only background across the past 6 years, despite earlier in-house roles.',
  },
  {
    id: 'c10', name: 'Felix Wagenaar', title: 'Talent Acquisition Specialist', loc: 'Rotterdam, NL',
    score: 47, must: 2, nice: 2, flag: 1,
    confidence: 'high', status: 'flagged',
    summary: 'Flagged: prior roles tagged "Sales Recruiting" with no engineering or product hires identified.',
  },
  {
    id: 'c11', name: 'Beatrice Lonnberg', title: 'Recruiter @ Halo Group', loc: 'Copenhagen, DK',
    score: 42, must: 1, nice: 2, flag: 0,
    confidence: 'low', status: 'review',
    summary: 'CV in Danish — partial machine translation. Two criteria could not be confidently evaluated.',
    parseWarning: 'Danish original; partial translation',
  },
];

// Detailed evaluation for Tanvi (the hero candidate)
const CANDIDATE_EVAL = {
  c1: {
    cv: {
      name: 'Tanvi Ramaswamy',
      contact: 'tanvi.ramaswamy@hexm.io  ·  +31 6 24 19 88 02  ·  Amsterdam, NL',
      summary:
        'Senior talent partner with eight years of in-house technology recruiting across the Netherlands, Germany, and the United Kingdom. Built and refined the senior-IC pipeline at Hexagonal from a single recruiter to a four-person team; designed the rubric and scorecard the entire department uses today.',
      roles: [
        {
          title: 'Senior Talent Partner — Hexagonal',
          dates: '2022 — present',
          loc: 'Amsterdam',
          bullets: [
            'Owned senior-IC and staff-level engineering pipelines across NL, DE, and UK; closed 47 hires in 2024 alone.',
            'Designed the company-wide interview rubric in partnership with the VP of Engineering — used by every hiring panel since.',
            'Conducted more than 500 full-cycle interviews over the past three years; coached six peers on structured interviewing.',
            'Built dashboards in Recruitee + Looker tracking funnel conversion by source, role family, and country.',
          ],
        },
        {
          title: 'Talent Partner — Loomtree',
          dates: '2019 — 2022',
          loc: 'Berlin',
          bullets: [
            'Generalist recruiting across product, design, and engineering; coverage in Germany, France, and Spain.',
            'Introduced calibrated scorecards that reduced first-screen-to-onsite false-positive rate by an estimated 38%.',
          ],
        },
        {
          title: 'In-house Recruiter — Crispin',
          dates: '2017 — 2019',
          loc: 'London',
          bullets: [
            'First-ever in-house recruiter; hired 32 engineers and designers across the first growth wave.',
          ],
        },
      ],
      skills: 'Recruitee · Greenhouse · structured interviewing · scorecard design · Looker · German (B2) · Dutch (B1) · French (A2)',
    },
    sections: [
      { kind: 'must', label: 'Must-have criteria', items: [
        { id: 'm1', name: '5+ years in-house tech recruiting', met: true, conf: 'high',
          quote: 'eight years of in-house technology recruiting across the Netherlands, Germany, and the United Kingdom',
          notes: '8 years in-house, well above the 5-year bar.' },
        { id: 'm2', name: '500+ full-cycle interviews conducted', met: true, conf: 'high',
          quote: 'Conducted more than 500 full-cycle interviews over the past three years',
          notes: 'Direct mention, with timeframe.' },
        { id: 'm3', name: 'EMEA market experience (multi-country)', met: true, conf: 'high',
          quote: 'across NL, DE, and UK', notes: 'Three EMEA markets called out; earlier role added FR + ES.' },
        { id: 'm4', name: 'Owned senior IC or leadership pipelines', met: true, conf: 'high',
          quote: 'Owned senior-IC and staff-level engineering pipelines',
          notes: 'Explicit ownership of senior + staff IC pipelines.' },
        { id: 'm5', name: 'Comfortable with ATS data + reporting', met: true, conf: 'medium',
          quote: 'Built dashboards in Recruitee + Looker tracking funnel conversion',
          notes: 'Built dashboards; not described as data lead.' },
      ]},
      { kind: 'nice', label: 'Nice-to-have', items: [
        { id: 'n1', name: 'Recruitee or Greenhouse power user', met: true, conf: 'high',
          quote: 'Recruitee · Greenhouse', notes: 'Both listed under tools.' },
        { id: 'n2', name: 'Built or revised a hiring rubric / scorecard', met: true, conf: 'high',
          quote: 'Designed the company-wide interview rubric in partnership with the VP of Engineering',
          notes: 'Strong direct evidence.' },
        { id: 'n3', name: 'Worked at <500-person company', met: true, conf: 'medium',
          inferred: 'Hexagonal listed first hire as a recruiter for a single team; size at hire estimated under 500 from context, but headcount not explicitly stated on CV.',
          notes: 'Inferred — recommend verifying in screen.' },
        { id: 'n4', name: 'German or French working proficiency', met: true, conf: 'medium',
          quote: 'German (B2) · Dutch (B1) · French (A2)',
          notes: 'B2 German meets the bar; French at A2 does not.' },
      ]},
      { kind: 'flag', label: 'Red flags', items: [
        { id: 'r1', name: 'No experience with technical roles', met: false, conf: 'high', notes: 'Clear technical recruiting throughout.' },
        { id: 'r2', name: 'Agency-only background, no in-house', met: false, conf: 'high', notes: 'Entirely in-house since 2017.' },
        { id: 'r3', name: 'Frequent <12-month tenures', met: false, conf: 'high', notes: '3 years, 3 years, 2 years — stable tenures.' },
      ]},
    ],
  },
};

// Audit log entries
const AUDIT = [
  { ts: 'May 12, 2026  09:14', who: 'You', msg: 'Bumped weight on “500+ full-cycle interviews” from 4 → 5', reason: 'Hiring panel feedback' },
  { ts: 'Apr 28, 2026  16:02', who: 'Mara Achterberg', msg: 'Added “Frequent <12-month tenures” to red flags', reason: '—', warned: true },
  { ts: 'Apr 28, 2026  16:01', who: 'Mara Achterberg', msg: 'Removed “Native English speaker”', reason: 'Replaced with “EMEA market experience”' },
  { ts: 'Apr 18, 2026  11:22', who: 'You', msg: 'Renamed job to “Senior TA — EMEA generalist”', reason: '—' },
  { ts: 'Apr 04, 2026  10:48', who: 'Idris Park', msg: 'Duplicated from “Senior TA — Generalist v2”', reason: '—' },
  { ts: 'Mar 30, 2026  14:30', who: 'Idris Park', msg: 'Created job', reason: '—' },
];

// Recruitee mock positions
/** Shared mock applicant rows for Recruitee CV picker (job run sheet). */
const RECRUITEE_APPLICANT_ROWS = [
  { name: 'Tanvi Ramaswamy', loc: 'Amsterdam', status: 'ok' },
  { name: 'Joaquin Pereira-Vidal', loc: 'Lisbon', status: 'ok' },
  { name: 'Esther Kowalski', loc: 'Berlin', status: 'ok' },
  { name: 'Yusuf Demirel', loc: 'Istanbul', status: 'ok' },
  { name: 'Cosima Brandt', loc: 'Munich', status: 'warn', reason: 'Pages 2–3 scanned, OCR low-confidence' },
  { name: 'Beatrice Lonnberg', loc: 'Copenhagen', status: 'warn', reason: 'Danish original; partial translation' },
  { name: 'Marcus Oduya', loc: 'London', status: 'ok' },
  { name: 'Felix Wagenaar', loc: 'Rotterdam', status: 'ok' },
];

const DEFAULT_RECRUITEE_ROW_SELECTED = [true, true, true, true, true, true, false, false];

const RECRUITEE_JOBS = [
  { id: 'rec-2841', title: 'Senior Talent Partner, EMEA', dept: 'People',      apps: 38 },
  { id: 'rec-2839', title: 'Staff Backend Engineer, Payments', dept: 'Engineering', apps: 64 },
  { id: 'rec-2837', title: 'Lead Product Designer',       dept: 'Design',      apps: 22 },
  { id: 'rec-2836', title: 'Customer Success Manager, DACH', dept: 'GTM',      apps: 51 },
  { id: 'rec-2834', title: 'Engineering Manager, Platform', dept: 'Engineering', apps: 31 },
];

const JOB_DESC_PREVIEW = `We're hiring a Senior Talent Partner to own senior-IC and leadership hiring across our EMEA hubs (Amsterdam, Berlin, Lisbon, London). You'll partner directly with hiring managers in Engineering, Product, and Design — running structured loops, calibrating panels, and using data to refine where our funnels lose great candidates.

You'll inherit a healthy ATS (Recruitee) and a working rubric, but the bar is going up: we want someone who has lived through scaling a TA function past 100 hires/year, knows what an unhealthy pipeline looks like before the numbers tell you, and can push back on a hiring manager when the brief drifts.

Requirements
  · 5+ years in-house tech recruiting (in-house, not agency)
  · A real track record of senior IC or leadership pipelines — not just volume
  · Multi-country EMEA experience
  · Comfortable in the data: funnel conversion, source quality, time-in-stage`;

/**
 * Completed screening runs for a job (by profile id).
 */
function getCompletedRunsForProfile(profileId) {
  if (!profileId) return [];
  return RUNS.filter((r) => r.profileId === profileId && r.status === 'completed');
}

/**
 * Flat rows: one row per candidate per run (mock). Hero job uses CANDIDATES for the latest run row in RUNS.
 * Production would load from API keyed by run_id.
 */
function getCandidateRowsForJob(profileId) {
  const completed = getCompletedRunsForProfile(profileId);
  if (completed.length === 0) return [];

  if (profileId === HERO_PROFILE.id) {
    const run = completed[0];
    return CANDIDATES.map((c) => ({
      key: `${run.id}-${c.id}`,
      candidateId: c.id,
      name: c.name,
      title: c.title,
      loc: c.loc,
      score: c.score,
      status: c.status,
      confidence: c.confidence,
      runId: run.id,
      runDate: run.date,
    }));
  }

  return completed.flatMap((run) => {
    const n = Math.min(6, Math.max(2, Math.floor((run.cvs || 24) / 15)));
    return Array.from({ length: n }, (_, i) => {
      const code = /^\d{8}$/.test(String(run.id))
        ? String(run.id).slice(0, 4)
        : String(run.id).replace(/[^0-9]/g, '').slice(-4) || String(i + 1);
      return {
        key: `${run.id}-s${i}`,
        candidateId: null,
        name: `Applicant ${code}-${i + 1}`,
        title: 'Sample role · CV screening',
        loc: ['Berlin', 'Lisbon', 'London', 'Amsterdam', 'Munich'][i % 5],
        score: 78 - i * 6,
        status: i === 0 ? 'strong' : 'promising',
        confidence: i === 0 ? 'high' : 'medium',
        runId: run.id,
        runDate: run.date,
      };
    });
  });
}

function getRunById(runId) {
  if (!runId) return RUNS.find((r) => r.isHero) || RUNS[0];
  const fromList = RUNS.find((r) => r.id === runId);
  if (fromList) return fromList;
  if (runId) {
    try {
      const key = DEMO_RUN_SESSION_KEY;
      if (typeof sessionStorage !== 'undefined') {
        const raw = sessionStorage.getItem(key);
        if (raw) {
          const payload = JSON.parse(raw);
          if (payload.run && String(payload.run.id) === String(runId)) {
            const r = { ...payload.run };
            if (!r.profileId && payload.profileId) r.profileId = payload.profileId;
            return r;
          }
        }
      }
    } catch (_) {}
  }
  return RUNS.find((r) => r.isHero) || RUNS[0];
}

/**
 * Session payload after Run screening “Run now” (see ProfilesPage RunScreeningSheet).
 * Includes `run` so getRunById can resolve the latest demo run from sessionStorage (same DDMMYYYY id as `run.id`).
 */
export {
  RUNS,
  HERO_PROFILE,
  PROFILES,
  CANDIDATES,
  CANDIDATE_EVAL,
  AUDIT,
  RECRUITEE_JOBS,
  RECRUITEE_APPLICANT_ROWS,
  DEFAULT_RECRUITEE_ROW_SELECTED,
  JOB_DESC_PREVIEW,
  getRunById,
  getCompletedRunsForProfile,
  getCandidateRowsForJob,
  formatRunIdFromDate,
};
