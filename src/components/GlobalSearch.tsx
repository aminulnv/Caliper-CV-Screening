import { useEffect, useId, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api, type SearchResponse } from '@/services/api'

const EMPTY: SearchResponse = { jobs: [], runs: [], candidates: [] }

export function GlobalSearch() {
  const navigate = useNavigate()
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResponse>(EMPTY)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults(EMPTY)
      setLoading(false)
      return
    }

    setLoading(true)
    const timer = window.setTimeout(() => {
      api.search(trimmed)
        .then((data) => {
          setResults(data)
          setOpen(true)
        })
        .catch(() => setResults(EMPTY))
        .finally(() => setLoading(false))
    }, 300)

    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const hasResults =
    results.jobs.length > 0 || results.runs.length > 0 || results.candidates.length > 0

  const go = (path: string) => {
    setOpen(false)
    setQuery('')
    navigate(path)
  }

  return (
    <div className="global-search" ref={rootRef}>
      <div className="shell-search global-search__input-wrap">
        <Search size={13} className="shell-search__icon" aria-hidden />
        <input
          className="shell-search__input"
          placeholder="Search jobs, runs, candidates…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (e.target.value.trim().length >= 2) setOpen(true)
          }}
          onFocus={() => {
            if (query.trim().length >= 2) setOpen(true)
          }}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          role="combobox"
        />
      </div>

      {open && query.trim().length >= 2 && (
        <div className="global-search__panel" id={listboxId} role="listbox">
          {loading && <div className="global-search__empty">Searching…</div>}
          {!loading && !hasResults && (
            <div className="global-search__empty">No results for “{query.trim()}”</div>
          )}
          {!loading && results.jobs.length > 0 && (
            <div className="global-search__group">
              <div className="global-search__label">Jobs</div>
              {results.jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  className="global-search__item"
                  role="option"
                  onClick={() => go('/jobs')}
                >
                  <span className="global-search__title">{job.name}</span>
                  {job.dept && <span className="global-search__meta">{job.dept}</span>}
                </button>
              ))}
            </div>
          )}
          {!loading && results.runs.length > 0 && (
            <div className="global-search__group">
              <div className="global-search__label">Runs</div>
              {results.runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  className="global-search__item"
                  role="option"
                  onClick={() => go(`/runs/${run.id}`)}
                >
                  <span className="global-search__title">{run.job_name ?? run.id}</span>
                  <span className="global-search__meta">{run.id}</span>
                </button>
              ))}
            </div>
          )}
          {!loading && results.candidates.length > 0 && (
            <div className="global-search__group">
              <div className="global-search__label">Candidates</div>
              {results.candidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  className="global-search__item"
                  role="option"
                  onClick={() => go(`/runs/${candidate.run_id}`)}
                >
                  <span className="global-search__title">{candidate.name ?? 'Unnamed'}</span>
                  <span className="global-search__meta">
                    {candidate.job_name ?? candidate.run_id}
                    {candidate.score != null ? ` · ${candidate.score}` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
