/** Helpers for side-by-side candidate comparison matrix. */

export type CompareCriterion = {
  id: string;
  kind: 'must' | 'nice' | 'flag';
  name: string;
  weight: number;
};

export type CompareEvalCell = {
  met: boolean | null;
  confidence: 'high' | 'medium' | 'low' | null;
  quote: string | null;
  inferred: boolean;
  overridden_by: string | null;
  agreed_by: string | null;
};

export type CompareRow = {
  criterion: CompareCriterion;
  cells: Record<string, CompareEvalCell | undefined>;
};

const KIND_ORDER: Record<string, number> = { must: 0, nice: 1, flag: 2 };
const KIND_LABEL: Record<string, string> = {
  must: 'Must-have criteria',
  nice: 'Nice-to-have',
  flag: 'Red flags',
};

export function truncateQuote(quote: string | null | undefined, maxLen = 120): string | null {
  if (!quote?.trim()) return null;
  const trimmed = quote.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

export function buildCompareRows(
  criteria: CompareCriterion[],
  evaluationsByCandidate: Record<string, Record<string, CompareEvalCell>>,
  candidateIds: string[],
): CompareRow[] {
  return criteria.map((criterion) => ({
    criterion,
    cells: Object.fromEntries(
      candidateIds.map((id) => [id, evaluationsByCandidate[id]?.[criterion.id]]),
    ),
  }));
}

export function criterionHasDisagreement(row: CompareRow, candidateIds: string[]): boolean {
  const values = candidateIds.map((id) => row.cells[id]?.met ?? null);
  const first = values[0];
  return values.some((v) => v !== first);
}

export function groupCompareRowsByKind(rows: CompareRow[]): Array<{ kind: string; label: string; rows: CompareRow[] }> {
  const groups: Array<{ kind: string; label: string; rows: CompareRow[] }> = [];
  let currentKind: string | null = null;

  for (const row of rows) {
    if (row.criterion.kind !== currentKind) {
      currentKind = row.criterion.kind;
      groups.push({
        kind: currentKind,
        label: KIND_LABEL[currentKind] ?? currentKind,
        rows: [],
      });
    }
    groups[groups.length - 1].rows.push(row);
  }

  return groups;
}

export function sortCompareCriteria(criteria: CompareCriterion[]): CompareCriterion[] {
  return [...criteria].sort((a, b) => {
    const kindDiff = (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9);
    if (kindDiff !== 0) return kindDiff;
    return a.name.localeCompare(b.name);
  });
}

export { KIND_LABEL };
