# Settings Page — Design Overrides

> Overrides [`MASTER.md`](MASTER.md) for the admin Settings page.

## Layout

- **Shell:** `settings-page` with header + sticky section nav + main content column.
- **Nav:** Desktop left sidebar (200px); mobile horizontal pill strip (`<1024px`).
- **Sections:** Anchor IDs — `ai-provider`, `screening`, `team`, `integrations`, `retention`.
- **Scroll margin:** `scroll-margin-top: 24px` on section panels for nav jumps.

## Typography

| Element | Size | Weight |
|---------|------|--------|
| Page title | 28px | 600 |
| Panel title | 18px | 600 |
| Field label | 14px | 500 |
| Field hint | 12.5–13px | 400, line-height 1.5 |
| KPI value | 24–28px tabular mono | 600 |
| Table body | 14px | 400–500 |

Minimum interactive text: 14px. Touch targets on credit actions: ≥44px.

## KPI strip (team section)

Four cards when team loaded:
1. Seats used / max
2. Team total spent
3. Total credits allocated
4. Members blocked (credit exhaustion)

## Credits UX

- Table shows Allocated · Remaining · Status badge — no inline top-up controls.
- **Manage** opens anchored popover: remaining hero, +$5/+$10, labeled custom amount, Set unlimited.
- Viewers: "Not applicable" in credits column.

## Panels

Mirror `usage-panel` visual language: border, `radius-lg`, `shadow-1`, head with icon + title + sub.

## Feedback

- Save success/error: `settings-save-banner` with `role="status"`, auto-dismiss 3s.
- Team errors: alert banner inside team panel.

## Accessibility

- `aria-current="true"` on active nav link.
- Popover: `aria-expanded`, Escape closes, focus first control on open.
- Status uses Badge text + dot (not color alone).
