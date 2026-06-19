import { useEffect, useId, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api, type SearchResponse } from '@/services/api'

const EMPTY: SearchResponse = { jobs: [], runs: [], candidates: [] }

type FlatOption = {
  id: string
  path: string
  group: string
  title: string
  meta?: string | undefined
}

function flattenResults(results: SearchResponse): FlatOption[] {
  const items: FlatOption[] = []
  for (const job of results.jobs) {
    items.push({
      id: `job-${job.id}`,
      path: `/jobs?job=${encodeURIComponent(job.id)}`,
      group: 'Jobs',
      title: job.name,
      meta: job.dept ?? undefined,
    })
  }
  for (const run of results.runs) {
    items.push({
      id: `run-${run.id}`,
      path: `/runs/${run.id}`,
      group: 'Runs',
      title: run.job_name ?? run.id,
      meta: run.id,
    })
  }
  for (const candidate of results.candidates) {
    const path = candidate.run_id
      ? `/runs/${candidate.run_id}${candidate.id ? `?candidate=${encodeURIComponent(candidate.id)}` : ''}`
      : '/runs'
    items.push({
      id: `cand-${candidate.id}`,
      path,
      group: 'Candidates',
      title: candidate.name ?? 'Unnamed',
      meta: [
        candidate.job_name ?? candidate.run_id,
        candidate.score != null ? String(candidate.score) : '',
      ].filter(Boolean).join(' · '),
    })
  }
  return items
}

export function GlobalSearch() {
  const navigate = useNavigate()
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResponse>(EMPTY)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)

  const flatOptions = flattenResults(results)
  const hasResults = flatOptions.length > 0

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults(EMPTY)
      setLoading(false)
      setSearchError('')
      setActiveIndex(-1)
      return
    }

    setLoading(true)
    setSearchError('')
    const timer = window.setTimeout(() => {
      api.search(trimmed)
        .then((data) => {
          setResults(data)
          setOpen(true)
          setActiveIndex(data.jobs.length + data.runs.length + data.candidates.length > 0 ? 0 : -1)
        })
        .catch(() => {
          setResults(EMPTY)
          setSearchError('Search failed. Try again.')
        })
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
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const go = (path: string) => {
    setOpen(false)
    setQuery('')
    setActiveIndex(-1)
    navigate(path)
  }

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!open || flatOptions.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => (i + 1) % flatOptions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => (i <= 0 ? flatOptions.length - 1 : i - 1))
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault()
      go(flatOptions[activeIndex].path)
    }
  }

  let optionOffset = 0
  const groups: { label: string; items: FlatOption[] }[] = []
  if (results.jobs.length) groups.push({ label: 'Jobs', items: flatOptions.filter((o) => o.group === 'Jobs') })
  if (results.runs.length) groups.push({ label: 'Runs', items: flatOptions.filter((o) => o.group === 'Runs') })
  if (results.candidates.length) groups.push({ label: 'Candidates', items: flatOptions.filter((o) => o.group === 'Candidates') })

  return (
    <div className="global-search" ref={rootRef}>
      <div className="shell-search global-search__input-wrap">
        <Search size={13} className="shell-search__icon" aria-hidden />
        <input
          ref={inputRef}
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
          onKeyDown={handleInputKeyDown}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
          }
          role="combobox"
        />
      </div>

      {open && query.trim().length >= 2 && (
        <div className="global-search__panel" id={listboxId} role="listbox">
          {loading && <div className="global-search__empty">Searching…</div>}
          {!loading && searchError && (
            <div className="global-search__empty" style={{ color: 'var(--bad-ink)' }}>{searchError}</div>
          )}
          {!loading && !searchError && !hasResults && (
            <div className="global-search__empty">No results for “{query.trim()}”</div>
          )}
          {!loading && !searchError && groups.map((group) => (
            <div key={group.label} className="global-search__group">
              <div className="global-search__label">{group.label}</div>
              {group.items.map((item) => {
                const idx = optionOffset
                optionOffset += 1
                const isActive = idx === activeIndex
                return (
                  <button
                    key={item.id}
                    id={`${listboxId}-opt-${idx}`}
                    type="button"
                    className={`global-search__item${isActive ? ' global-search__item--active' : ''}`}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => go(item.path)}
                  >
                    <span className="global-search__title">{item.title}</span>
                    {item.meta && <span className="global-search__meta">{item.meta}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
