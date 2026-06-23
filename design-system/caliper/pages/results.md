# Results Page — Design Overrides

> Overrides [`MASTER.md`](../MASTER.md) for run screening results.

## Layout

- **Shell:** `.results-page` — `PageHeader`, actions row, access control, status banners, `KpiStrip`, filter bar, ranked table
- **Detail:** `.detail` / `.detail__panel` — full-screen candidate drawer with CV + evaluation split
- **Compare:** `CandidateCompareSheet` — side-by-side (max 4 candidates)

## KPI strip (clickable filters)

1. Strong matches (≥ 85)
2. Promising (65–84)
3. Review / flagged
4. Mean confidence

## BEM classes

- `results-page__actions|access|stats|filter-row|search`
- `results-banner--progress|failed|note|warn`
- `pipeline-decisions-panel` + feedback/toast on disposition

## Primitives

- `KpiStrip` with `clickable` / `active` for stat filters
- `AppToast` for disposition success/error
- `PageError` for eval load failures in detail drawer

## Accessibility

- Sortable headers: `aria-sort`
- Table rows: `tabIndex={0}`, Enter/Space to open detail
- Detail drawer: `role="dialog"`, Escape to close
- Compare checkboxes: `aria-label`, `.focus-ring`
