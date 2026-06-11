// @ts-nocheck
import React from 'react'
import { ScoreBar, StatusBadge } from '@/caliper/ui'
import { CompareCell } from '@/caliper/components/CompareCell'
import {
  buildCompareRows,
  criterionHasDisagreement,
  groupCompareRowsByKind,
} from '@/lib/compare-candidates'
import { countsFromCandidateRow } from '@/lib/criteria-checklist'

export function CompareMatrix({
  data,
  differencesOnly,
  onOpenCandidate,
  tweaks,
}) {
  const candidateIds = data.candidates.map((c) => c.id);
  const rows = React.useMemo(
    () => buildCompareRows(data.criteria, data.evaluations, candidateIds),
    [data.criteria, data.evaluations, candidateIds],
  );

  const visibleGroups = React.useMemo(() => {
    const filtered = differencesOnly
      ? rows.filter((row) => criterionHasDisagreement(row, candidateIds))
      : rows;
    return groupCompareRowsByKind(filtered);
  }, [rows, differencesOnly, candidateIds]);

  if (visibleGroups.length === 0) {
    return (
      <div className="compare-matrix__empty muted">
        {differencesOnly
          ? 'No criterion disagreements between these candidates.'
          : 'No criteria to compare.'}
      </div>
    );
  }

  return (
    <div className="compare-matrix">
      <table className="compare-matrix__table">
        <thead>
          <tr>
            <th className="compare-matrix__criterion-col" scope="col">Criterion</th>
            {data.candidates.map((c) => {
              const counts = countsFromCandidateRow(c);
              return (
                <th key={c.id} scope="col" className="compare-matrix__candidate-col">
                  <button
                    type="button"
                    className="compare-matrix__candidate-hd"
                    onClick={() => onOpenCandidate?.(c.id)}
                  >
                    <span className="compare-matrix__candidate-name">{c.name ?? '—'}</span>
                    <span className="compare-matrix__candidate-meta muted">
                      {c.title}{c.location ? ` · ${c.location}` : ''}
                    </span>
                    <div className="compare-matrix__candidate-score">
                      <ScoreBar
                        score={c.score ?? 0}
                        must={counts?.mustMet ?? c.must_met ?? 0}
                        nice={counts?.niceMet ?? c.nice_met ?? 0}
                        flag={counts?.flagTriggered ?? c.flag_triggered ?? 0}
                        variant={tweaks?.scoreStyle}
                      />
                    </div>
                    <div className="compare-matrix__candidate-badges">
                      <StatusBadge s={c.status}/>
                    </div>
                    <span className="compare-matrix__open-hint muted">Open detail →</span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {visibleGroups.map((group) => (
            <React.Fragment key={group.kind}>
              <tr className="compare-matrix__section-row">
                <td colSpan={candidateIds.length + 1}>
                  <div className="eval-sec">
                    <span>{group.label}</span>
                    <span className="eval-sec__line"/>
                    <span className="mono">{group.rows.length} criteria</span>
                  </div>
                </td>
              </tr>
              {group.rows.map((row) => {
                const split = criterionHasDisagreement(row, candidateIds);
                return (
                  <tr
                    key={row.criterion.id}
                    className={`compare-row${split ? ' is-split' : ''}`}
                  >
                    <th className="compare-matrix__criterion-col" scope="row">
                      <div className="compare-matrix__criterion-name">{row.criterion.name}</div>
                      <div className="compare-matrix__criterion-meta mono muted">
                        <span className={`compare-kind compare-kind--${row.criterion.kind}`}>
                          {row.criterion.kind}
                        </span>
                        {row.criterion.weight != null && <> · ×{row.criterion.weight}</>}
                      </div>
                    </th>
                    {candidateIds.map((id) => (
                      <CompareCell
                        key={id}
                        cell={row.cells[id]}
                        kind={row.criterion.kind}
                      />
                    ))}
                  </tr>
                );
              })}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
