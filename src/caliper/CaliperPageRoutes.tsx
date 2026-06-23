// @ts-nocheck
import React, { Suspense } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import RunsPage from '@/caliper/pages/RunsPage'
import ResultsPage from '@/caliper/pages/ResultsPage'
import UsagePage from '@/caliper/pages/UsagePage'
import ActivityPage from '@/caliper/pages/ActivityPage'
import CaliperSettingsPage from '@/caliper/pages/CaliperSettingsPage'
import TalentSearchPage from '@/caliper/pages/TalentSearchPage'
import ProfilePage from '@/pages/ProfilePage'
import { PageLoading } from '@/caliper/ui'
import { useCaliperGo } from '@/caliper/CaliperNavContext'
import { useCaliperTweaks } from '@/caliper/CaliperShellLayout'
import { getRunById } from '@/caliper/data'

const ProfilesPage = React.lazy(() => import('@/caliper/pages/ProfilesPage'))

function JobsPageFallback() {
  return (
    <div className="page">
      <div className="card">
        <PageLoading title="Loading jobs" message="Fetching your job list…" />
      </div>
    </div>
  )
}

export function RunsPageRoute() {
  const go = useCaliperGo()
  return <RunsPage go={go} />
}

export function JobsPageRoute() {
  const go = useCaliperGo()
  const { jobId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const screenJobId = searchParams.get('screen')
  const deepLinkTab = searchParams.get('tab')
  const legacyJobId = searchParams.get('job')
  const clearSearchParams = () => setSearchParams({}, { replace: true })
  return (
    <Suspense fallback={<JobsPageFallback />}>
      <ProfilesPage
        go={go}
        route={{
          jobId: jobId ?? legacyJobId,
          screenJobId,
          deepLinkTab,
          clearSearchParams,
        }}
      />
    </Suspense>
  )
}

export function ResultsPageRoute() {
  const go = useCaliperGo()
  const tweaks = useCaliperTweaks()
  const { runId } = useParams()
  const [searchParams] = useSearchParams()
  const candidateId = searchParams.get('candidate')
  if (!runId) {
    return <Navigate to="/runs" replace />
  }
  const run = getRunById(runId)
  return (
    <ResultsPage
      go={go}
      tweaks={tweaks}
      route={{ page: 'results', runId, run, candidateId }}
    />
  )
}

export function UsagePageRoute() {
  return <UsagePage />
}

export function ActivityPageRoute() {
  return <ActivityPage />
}

export function CaliperSettingsRoute() {
  return <CaliperSettingsPage />
}

export function TalentSearchPageRoute() {
  return <TalentSearchPage />
}

export function ProfilePageRoute() {
  return <ProfilePage />
}
