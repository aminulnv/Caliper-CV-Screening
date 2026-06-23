import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

export type CaliperGo = (
  page: 'runs' | 'profiles' | 'settings' | 'results',
  second?: string | { run: string; candidate?: string; job?: string; tab?: string },
) => void

const CaliperNavContext = createContext<CaliperGo>(() => {})

export function CaliperNavProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const go = useCallback<CaliperGo>((page, second) => {
    if (page === 'results' && second && typeof second === 'object' && 'run' in second && second.run) {
      const search = second.candidate
        ? `candidate=${encodeURIComponent(second.candidate)}`
        : ''
      navigate({
        pathname: `/runs/${encodeURIComponent(String(second.run))}`,
        search,
      })
      return
    }
    if (page === 'results' && typeof second === 'string' && second) {
      navigate(`/runs/${encodeURIComponent(second)}`)
      return
    }
    if (page === 'profiles' && second && typeof second === 'object' && 'job' in second && second.job) {
      const tab = second.tab ? `?tab=${encodeURIComponent(String(second.tab))}` : ''
      navigate(`/jobs/${encodeURIComponent(String(second.job))}${tab}`)
      return
    }
    if (page === 'profiles') {
      navigate('/jobs')
      return
    }
    if (page === 'runs') {
      navigate('/runs')
      return
    }
    if (page === 'settings') {
      navigate('/settings')
      return
    }
    navigate('/jobs')
  }, [navigate])

  return <CaliperNavContext.Provider value={go}>{children}</CaliperNavContext.Provider>
}

export function useCaliperGo(): CaliperGo {
  return useContext(CaliperNavContext)
}
