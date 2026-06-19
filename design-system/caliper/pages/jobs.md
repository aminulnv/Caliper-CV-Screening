# Jobs Page — Design Overrides

> Overrides [`MASTER.md`](MASTER.md) for the Jobs / Profiles recruiting workspace.

## Layout shells

- **List:** `.jobs-page` — hero header, KPI strip, toolbar, table panel
- **Detail:** `.job-detail-page` — back control, hero, sticky `.job-tab-nav`, tab panes in `.jobs-panel`
- **Run sheet:** `.run-sheet` — stepper header, source cards, summary step

## Typography

| Element | Size | Weight |
|---------|------|--------|
| Page title | 28px | 600 |
| Job row title | 14px | 600 |
| Table / tab labels | 14px | 500 |
| Meta (dept, dates) | 12.5–13px | 400 |
| KPI values | 22–28px tabular | 600 |

Minimum interactive text: 14px. Primary actions ≥44px height.

## KPI strip (list)

1. Open jobs
2. Total applicants (Recruitee jobs)
3. Screening runs
4. Needs criteria (zero criteria items)

## Tab labels (short)

Overview · Criteria · Runs · Applicants · Talent · Activity

## Run sheet

Steps: **1 Select CVs** → **2 Review & run**. Credits callout uses PAYG copy.

## Accessibility

- Tab `aria-selected`, job table row keyboard focus
- Status/source: Badge + icon
- Run sheet: Escape closes, focus on open

## Anti-patterns

- No dead Duplicate/Archive buttons without handlers
- No 11px primary content for job titles or IDs in main column
