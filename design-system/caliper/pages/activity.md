# Activity Page — Design Overrides

> Overrides [`MASTER.md`](../MASTER.md) for workspace audit trail.

## Layout

- `PageHeader` with Refresh action
- `KpiStrip`: Activities, Jobs involved, People active (admin)
- Filter chips by event category
- `ActivityLogList` for entries

## States

- `TableSkeleton` while loading
- `PageError` + retry on failure

## Filter groups

All · Screening · Criteria · Candidates · Recruitee · Jobs
