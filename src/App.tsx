import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthGuard } from '@/components/AuthGuard'
import { AuthenticatedLayout } from '@/layout'
import { CaliperNavProvider } from '@/caliper/CaliperNavContext'
import CaliperShellLayout from '@/caliper/CaliperShellLayout'
import {
  RunsPageRoute,
  JobsPageRoute,
  ResultsPageRoute,
  TalentSearchPageRoute,
  CaliperSettingsRoute,
} from '@/caliper/CaliperPageRoutes'

function App() {
  return (
    <AuthGuard>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={<AuthenticatedLayout />}
          >
            <Route element={<CaliperNavProvider><CaliperShellLayout /></CaliperNavProvider>}>
              <Route index element={<Navigate to="/runs" replace />} />
              <Route path="runs" element={<RunsPageRoute />} />
              <Route path="runs/:runId" element={<ResultsPageRoute />} />
              <Route path="jobs" element={<JobsPageRoute />} />
              <Route path="talent-search" element={<TalentSearchPageRoute />} />
              <Route path="settings" element={<CaliperSettingsRoute />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/runs" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthGuard>
  )
}

export default App
