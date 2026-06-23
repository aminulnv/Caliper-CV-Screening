// @ts-nocheck
import { jobDateSortKey, shapeJobRow } from '@/lib/job-profile'
import { prefetchRecruiteeApplicants } from '@/lib/applicants-cache'

export const JOB_TABLE_SORT_KEYS = {
  name: 'name',
  posted: 'posted',
  source: 'source',
  dept: 'dept',
  applicants: 'applicants',
  criteria: 'criteria',
  runs: 'runs',
  lastRun: 'lastRun',
  status: 'status',
}

export function shapeJobsList(jobs) {
  return jobs.map((j) => shapeJobRow(j as Record<string, unknown>))
}

export function getCriteriaListsForProfile(profile) {
  if (!profile) return { must: [], nice: [], flag: [] }
  return {
    must: profile.mustHave || [],
    nice: profile.niceToHave || [],
    flag: profile.redFlags || [],
  }
}

export function jobSortValue(profile, key) {
  switch (key) {
    case JOB_TABLE_SORT_KEYS.name:
      return profile.name?.toLowerCase() ?? ''
    case JOB_TABLE_SORT_KEYS.posted:
      return jobDateSortKey(profile.postedOnAt)
    case JOB_TABLE_SORT_KEYS.source:
      return profile.source ?? ''
    case JOB_TABLE_SORT_KEYS.dept:
      return profile.dept?.toLowerCase() ?? ''
    case JOB_TABLE_SORT_KEYS.applicants:
      return profile.applicantsCount ?? -1
    case JOB_TABLE_SORT_KEYS.criteria:
      return (profile.mustHave?.length ?? 0)
        + (profile.niceToHave?.length ?? 0)
        + (profile.redFlags?.length ?? 0)
    case JOB_TABLE_SORT_KEYS.runs:
      return profile.runsCount ?? 0
    case JOB_TABLE_SORT_KEYS.lastRun:
      return jobDateSortKey(profile.screeningRuns?.[0]?.createdAt)
    case JOB_TABLE_SORT_KEYS.status:
      return profile.status ?? ''
    default:
      return ''
  }
}

function compareJobSortValues(a, b) {
  const aNum = typeof a === 'number'
  const bNum = typeof b === 'number'
  if (aNum && bNum) return a - b
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true })
}

function isJobDateSortKey(key) {
  return key === JOB_TABLE_SORT_KEYS.posted || key === JOB_TABLE_SORT_KEYS.lastRun
}

function compareJobDateSortValues(a, b, dir) {
  const aEmpty = a <= 0
  const bEmpty = b <= 0
  if (aEmpty && bEmpty) return 0
  if (aEmpty) return 1
  if (bEmpty) return -1
  return dir === 'asc' ? a - b : b - a
}

export function sortJobProfiles(list, sortState) {
  if (!sortState) return list
  return [...list].sort((a, b) => {
    const va = jobSortValue(a, sortState.key)
    const vb = jobSortValue(b, sortState.key)
    if (isJobDateSortKey(sortState.key)) {
      return compareJobDateSortValues(va, vb, sortState.dir)
    }
    const cmp = compareJobSortValues(va, vb)
    return sortState.dir === 'asc' ? cmp : -cmp
  })
}

export function cycleJobTableSort(prev, key) {
  if (prev?.key !== key) return { key, dir: 'desc' }
  if (prev.dir === 'desc') return { key, dir: 'asc' }
  return null
}

export function computeJobListKpis(jobs) {
  let openCount = 0
  let totalApplicants = 0
  let totalRuns = 0
  let needsCriteria = 0
  for (const p of jobs) {
    if (p.status === 'open') openCount += 1
    if (p.source === 'recruitee' && p.applicantsCount != null) {
      totalApplicants += p.applicantsCount
    }
    totalRuns += p.runsCount || 0
    const c = (p.mustHave?.length ?? 0) + (p.niceToHave?.length ?? 0) + (p.redFlags?.length ?? 0)
    if (c === 0) needsCriteria += 1
  }
  return { openCount, totalApplicants, totalRuns, needsCriteria }
}

export function openJobProfile(navigate, profile, options = {}) {
  if (profile.source === 'recruitee' && profile.sourceRef) {
    prefetchRecruiteeApplicants(profile.sourceRef)
  }
  const lists = getCriteriaListsForProfile(profile)
  const criteriaCount = lists.must.length + lists.nice.length + lists.flag.length
  const tab = options.tab ?? (criteriaCount === 0 ? 'criteria' : null)
  const search = tab ? `?tab=${encodeURIComponent(tab)}` : ''
  navigate(`/jobs/${encodeURIComponent(profile.id)}${search}`)
}
