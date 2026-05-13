import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import { AuthenticatedLayout } from '@/layout'
import Login from '@/pages/Login'
import SignUp from '@/pages/SignUp'
import ForgotPassword from '@/pages/ForgotPassword'
import Profile from '@/pages/Profile'
import { CaliperNavProvider } from '@/caliper/CaliperNavContext'
import CaliperShellLayout from '@/caliper/CaliperShellLayout'
import {
  RunsPageRoute,
  JobsPageRoute,
  ResultsPageRoute,
  CaliperSettingsRoute,
} from '@/caliper/CaliperPageRoutes'

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        Loading…
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/runs" replace /> : <Login />} />
        <Route path="/signup" element={user ? <Navigate to="/runs" replace /> : <SignUp />} />
        <Route path="/forgot-password" element={user ? <Navigate to="/runs" replace /> : <ForgotPassword />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AuthenticatedLayout />
            </ProtectedRoute>
          }
        >
          <Route element={<CaliperNavProvider><CaliperShellLayout /></CaliperNavProvider>}>
            <Route index element={<Navigate to="/runs" replace />} />
            <Route path="runs" element={<RunsPageRoute />} />
            <Route path="runs/:runId" element={<ResultsPageRoute />} />
            <Route path="jobs" element={<JobsPageRoute />} />
            <Route path="settings" element={<CaliperSettingsRoute />} />
          </Route>
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/runs" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
