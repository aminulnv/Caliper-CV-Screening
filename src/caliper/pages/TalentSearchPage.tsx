// @ts-nocheck
import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '@/services/api'
import type { CvSearchResult } from '@/services/api'
import { StatusBadge, Btn, Icon, PageLoading, PageEmpty, RoleBlockedPage, PageHeader, PageError } from '@/caliper/ui'
import { semanticCvSearchEnabled } from '@/config/features'
import { useAuth } from '@/contexts/AuthContext'

const MIN_QUERY_LENGTH = 3
const SEARCH_DEBOUNCE_MS = 400

const EXAMPLE_QUERIES = [
  'Kubernetes and platform engineering',
  'Fintech compliance background',
  'Senior product manager B2B SaaS',
  'Python machine learning PhD',
]

function formatMatchPct(similarity: number): string {
  return `${Math.round(similarity * 100)}%`
}

function TalentPageHeader({ subtitle }) {
  return (
    <PageHeader
      eyebrow="Discovery"
      hideTitle
      subtitle={subtitle}
    />
  )
}

function TalentSearchComingSoon() {
  return (
    <div className="page talent-search">
      <TalentPageHeader
        subtitle="Natural-language search across screened CVs — skills, industries, tools, and experience."
      />
      <div className="callout talent-search__coming-soon">
        <div className="talent-search__soon-badge mono">Coming soon</div>
        <p style={{ margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.55 }}>
          Workspace-wide semantic CV search needs the PostgreSQL <strong>pgvector</strong> extension.
          Once it is enabled and migrations complete, this page will search every screened CV in your workspace.
        </p>
        <p className="muted" style={{ margin: '12px 0 0', fontSize: 12.5, lineHeight: 1.5 }}>
          Until then, open a job and use the <strong>Talent</strong> tab to discover LinkedIn profiles for that role, or browse{' '}
          <Link to="/runs">Processed CVs</Link> and use the global search bar for candidates by name.
        </p>
      </div>
    </div>
  )
}

export default function TalentSearchPage() {
  const { canEdit } = useAuth()

  if (!canEdit) {
    return (
      <div className="page talent-search">
        <RoleBlockedPage
          icon="search"
          title="Talent search unavailable"
          description="Your role cannot run workspace-wide CV search. Open a job and review saved profiles on its Talent tab, or browse shared screening results."
        />
        <p className="talent-search__viewer-link muted">
          <Link to="/jobs">Browse jobs →</Link>
        </p>
      </div>
    )
  }

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

  const showEmptyHint = submittedQuery.trim().length < MIN_QUERY_LENGTH && query.trim().length === 0

  return (
    <div className="page talent-search">
      <TalentPageHeader
        subtitle="Search across all screened CVs in your workspace using natural language — skills, industries, tools, and experience."
      />

      <form className="talent-search__form" onSubmit={handleSubmit}>
        <div className="talent-search__input-wrap">
          <Icon name="search" size={16} className="talent-search__input-icon" aria-hidden />
          <input
            className="inp talent-search__input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. fintech + Kubernetes experience"
            aria-label="Semantic CV search query"
            autoComplete="off"
          />
        </div>
        <Btn
          type="submit"
          variant="default"
          disabled={query.trim().length < MIN_QUERY_LENGTH || loading}
        >
          {loading ? 'Searching…' : 'Search'}
        </Btn>
      </form>

      {showEmptyHint && (
        <div className="talent-search__examples">
          <span className="talent-search__examples-label muted">Try:</span>
          {EXAMPLE_QUERIES.map((example) => (
            <button
              key={example}
              type="button"
              className="talent-search__example-chip"
              onClick={() => {
                setQuery(example)
                runSearch(example)
              }}
            >
              {example}
            </button>
          ))}
        </div>
      )}

      {needsOpenAiKey && (
        <div className="callout talent-search__callout">
          Semantic CV search requires an OpenAI API key. Add one under{' '}
          <Link to="/settings">Settings → API keys</Link>.
        </div>
      )}

      {error && !needsOpenAiKey && (
        <PageError
          message={error}
          onRetry={() => setSubmittedQuery((q) => q)}
        />
      )}

      {loading && (
        <div className="talent-search__loading">
          <PageLoading title="Searching CVs" message={`Matching “${submittedQuery.trim()}”…`} className="talent-search__loading-state" />
        </div>
      )}

      {!loading && submittedQuery.trim().length >= MIN_QUERY_LENGTH && !error && !needsOpenAiKey && results.length === 0 && (
        <PageEmpty
          icon="search"
          title="No matches"
          description={`No matches for “${submittedQuery.trim()}”. Try broader terms or run new screenings to embed more CVs.`}
        />
      )}

      {!loading && results.length > 0 && (
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

      {showEmptyHint && (
        <div className="talent-search__hint muted">
          Only CVs screened after semantic search was enabled are indexed. Re-run screening to add older candidates.
        </div>
      )}
    </div>
  )
}
