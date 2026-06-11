// @ts-nocheck
import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '@/services/api'
import type { CvSearchResult } from '@/services/api'
import { StatusBadge, Btn } from '@/caliper/ui'
import { semanticCvSearchEnabled } from '@/config/features'

const MIN_QUERY_LENGTH = 3
const SEARCH_DEBOUNCE_MS = 400

function formatMatchPct(similarity: number): string {
  return `${Math.round(similarity * 100)}%`
}

function TalentSearchComingSoon() {
  return (
    <div className="page talent-search">
      <div className="talent-search__hero">
        <h1 className="talent-search__title">Talent Search</h1>
        <p className="talent-search__sub muted">
          Natural-language search across screened CVs — skills, industries, tools, and experience.
        </p>
      </div>
      <div className="callout talent-search__coming-soon">
        <div className="talent-search__soon-badge mono">Coming soon</div>
        <p style={{ margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.55 }}>
          Semantic CV search needs the PostgreSQL <strong>pgvector</strong> extension on your database.
          Once your DBA enables it and migrations complete, we will turn this on for your workspace.
        </p>
        <p className="muted" style={{ margin: '12px 0 0', fontSize: 12.5, lineHeight: 1.5 }}>
          Until then, use <Link to="/runs">Runs</Link> and the global search bar for jobs, runs, and candidates by name.
        </p>
      </div>
    </div>
  )
}

export default function TalentSearchPage() {
  if (!semanticCvSearchEnabled) {
    return <TalentSearchComingSoon />
  }

  const navigate = useNavigate()
  const [query, setQuery] = React.useState('')
  const [submittedQuery, setSubmittedQuery] = React.useState('')
  const [results, setResults] = React.useState<CvSearchResult[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [needsOpenAiKey, setNeedsOpenAiKey] = React.useState(false)

  React.useEffect(() => {
    const trimmed = submittedQuery.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([])
      setError(null)
      setNeedsOpenAiKey(false)
      return
    }

    setLoading(true)
    setError(null)
    setNeedsOpenAiKey(false)

    api.cvSearch.query(trimmed)
      .then((data) => {
        setResults(data.results ?? [])
      })
      .catch((err) => {
        const message = err?.message ?? 'Search failed'
        if (/openai api key/i.test(message)) {
          setNeedsOpenAiKey(true)
          setError(null)
        } else {
          setError(message)
        }
        setResults([])
      })
      .finally(() => setLoading(false))
  }, [submittedQuery])

  const runSearch = React.useCallback((value: string) => {
    const trimmed = value.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) return
    setSubmittedQuery(trimmed)
  }, [])

  React.useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) return
    const timer = window.setTimeout(() => runSearch(trimmed), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query, runSearch])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    runSearch(query)
  }

  return (
    <div className="page talent-search">
      <div className="talent-search__hero">
        <h1 className="talent-search__title">Talent Search</h1>
        <p className="talent-search__sub muted">
          Search across all screened CVs in your workspace using natural language — skills, industries, tools, and experience.
        </p>
      </div>

      <form className="talent-search__form" onSubmit={handleSubmit}>
        <input
          className="inp talent-search__input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. fintech + Kubernetes experience"
          aria-label="Semantic CV search query"
          autoComplete="off"
        />
        <Btn
          type="submit"
          variant="default"
          disabled={query.trim().length < MIN_QUERY_LENGTH || loading}
        >
          {loading ? 'Searching…' : 'Search'}
        </Btn>
      </form>

      {needsOpenAiKey && (
        <div className="callout talent-search__callout">
          Semantic CV search requires an OpenAI API key. Add one under{' '}
          <Link to="/settings">Settings → API keys</Link>.
        </div>
      )}

      {error && !needsOpenAiKey && (
        <div className="callout talent-search__callout" style={{ color: 'var(--bad-ink)' }}>
          {error}
        </div>
      )}

      {!loading && submittedQuery.trim().length >= MIN_QUERY_LENGTH && !error && !needsOpenAiKey && results.length === 0 && (
        <div className="talent-search__empty muted">
          No matches for “{submittedQuery.trim()}”. Try broader terms or run new screenings to embed more CVs.
        </div>
      )}

      {results.length > 0 && (
        <div className="talent-search__results card">
          <div className="card__head">
            <span className="card__title">{results.length} match{results.length === 1 ? '' : 'es'}</span>
            <span className="muted mono" style={{ fontSize: 11.5 }}>{submittedQuery.trim()}</span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl talent-search__table">
              <thead>
                <tr>
                  <th>Match</th>
                  <th>Candidate</th>
                  <th>Job</th>
                  <th>Run</th>
                  <th>Score</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => (
                  <tr
                    key={row.candidate_id}
                    className="is-clickable"
                    onClick={() => {
                      navigate(`/runs/${row.run_id}?candidate=${encodeURIComponent(row.candidate_id)}`)
                    }}
                  >
                    <td className="mono">{formatMatchPct(row.similarity)}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{row.name ?? '—'}</div>
                      {row.title && <div className="muted" style={{ fontSize: 11.5 }}>{row.title}</div>}
                    </td>
                    <td>{row.job_name ?? '—'}</td>
                    <td className="mono" style={{ fontSize: 11.5 }}>{row.run_id}</td>
                    <td>{row.score ?? '—'}</td>
                    <td>{row.status ? <StatusBadge s={row.status} /> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {submittedQuery.trim().length < MIN_QUERY_LENGTH && query.trim().length === 0 && (
        <div className="talent-search__hint muted">
          Only CVs screened after semantic search was enabled are indexed. Re-run screening to add older candidates.
        </div>
      )}
    </div>
  )
}
