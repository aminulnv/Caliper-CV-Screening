// @ts-nocheck
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import RunsPage from '@/caliper/pages/RunsPage'
import ResultsPage from '@/caliper/pages/ResultsPage'
import ProfilesPage from '@/caliper/pages/ProfilesPage'
import CaliperSettingsPage from '@/caliper/pages/CaliperSettingsPage'
import { useCaliperGo } from '@/caliper/CaliperNavContext'
import { useCaliperTweaks } from '@/caliper/CaliperShellLayout'
import { getRunById } from '@/caliper/data'

export function RunsPageRoute() {
  const go = useCaliperGo()
  return <RunsPage go={go} />
}

export function JobsPageRoute() {
  const go = useCaliperGo()
  const [searchParams] = useSearchParams()
  const openRunJobId = searchParams.get('job')
  return <ProfilesPage go={go} route={{ openRunJobId }} />
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
