# Usage Page — Design Overrides

> Overrides [`MASTER.md`](../MASTER.md) for AI spend and credits.

## Layout

- `PageHeader` with link to Settings
- KPI grid (spend, budget, events) — migrate to `KpiStrip` over time
- Monthly breakdown + recent events table

## States

- `PageLoading` while fetching
- `PageError` + retry on failure
- Role-blocked empty for non-admin viewers

## Copy

Pay-as-you-go framing; admins manage credits in Settings.
