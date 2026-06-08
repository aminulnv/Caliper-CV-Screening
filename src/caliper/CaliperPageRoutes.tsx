// @ts-nocheck
import React, { Suspense } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import RunsPage from '@/caliper/pages/RunsPage'
import ResultsPage from '@/caliper/pages/ResultsPage'
import CaliperSettingsPage from '@/caliper/pages/CaliperSettingsPage'
import { useCaliperGo } from '@/caliper/CaliperNavContext'
import { useCaliperTweaks } from '@/caliper/CaliperShellLayout'
import { getRunById } from '@/caliper/data'

const ProfilesPage = React.lazy(() => import('@/caliper/pages/ProfilesPage'))

function JobsPageFallback() {
  return (
    <div className="page">
      <div className="card">
        <div className="jobs-loading">
          <div className="jobs-loading__spinner" role="status" aria-label="Loading jobs" />
          <div style={{ marginTop: 16, fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}>
            Loading jobs
          </div>
        </div>
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
  const [searchParams] = useSearchParams()
  const openRunJobId = searchParams.get('job')
  return (
    <Suspense fallback={<JobsPageFallback />}>
      <ProfilesPage go={go} route={{ openRunJobId }} />
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

export function CaliperSettingsRoute() {
  return <CaliperSettingsPage />
}
