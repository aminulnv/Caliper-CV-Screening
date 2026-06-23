# Runs Page — Design Overrides

> Overrides [`MASTER.md`](../MASTER.md) for the screening runs list.

## Layout

- **Shell:** `PageHeader` + `KpiStrip` + toolbar + `DataTable` (`.runs-table`)
- Reference implementation for list pages

## KPI strip

1. Total runs
2. Completed
3. In progress
4. Failed (if any)

## States

- `PageLoading` / `TableSkeleton` while fetching
- `PageError` + retry on failure
- Mobile: card list via `.runs-list-cards--mobile`

## Density

Respects `data-density` (`comfy` | `compact`) via `--row-h` / `--pad-cell`.
