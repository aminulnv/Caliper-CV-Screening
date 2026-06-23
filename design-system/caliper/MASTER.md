# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Caliper
**Generated:** 2026-06-19 13:24:41
**Category:** SaaS (General)

---

## Global Rules

### Color Palette (runtime — `caliper.css` / `styles/tokens.css`)

| Role | CSS Variable |
|------|--------------|
| Brand / CTA | `--brand-primary`, `--brand-primary-hover` |
| Canvas | `--bg`, `--surface`, `--bg-sunk` |
| Text | `--ink`, `--ink-soft`, `--muted` |
| Borders | `--line`, `--line-soft` |
| Semantic | `--ok`, `--warn`, `--bad` (+ `-soft`, `-ink`) |
| Shadows | `--shadow-1`, `--shadow-2`, `--shadow-pop` |
| Motion | `--motion-fast` (150ms), `--motion-base` (200ms) |
| Density | `data-density="comfy"` \| `"compact"` → `--row-h`, `--pad-cell` |

Legacy docs referencing `--color-primary` or `--space-*` are deprecated — use tokens above.

### Overlay primitives (`src/caliper/ui-overlays.tsx`)

| Primitive | Purpose |
|-----------|---------|
| `Modal` | Focus trap, Escape, `role="dialog"` |
| `Sheet` | Slide-in panel |
| `Alert` | Inline banner (`results-banner` pattern) |

### Feedback

| Primitive | Purpose |
|-----------|---------|
| `AppToast` | Transient success/error (`useToast`) |
| `RunScreeningBtn` | Run CTA with viewer lock hint |
| `PageError` | Error + retry |

### Color Palette (deprecated reference)

### Typography

- **Heading Font:** Plus Jakarta Sans
- **Body Font:** Plus Jakarta Sans
- **Mood:** friendly, modern, saas, clean, approachable, professional
- **Google Fonts:** [Plus Jakarta Sans + Plus Jakarta Sans](https://fonts.google.com/share?selection.family=Plus+Jakarta+Sans:wght@300;400;500;600;700)

#### Type scale (CSS tokens in `caliper.css`)

| Token | Value | Usage |
|-------|-------|-------|
| `--type-label` | `11px` | Eyebrows, table column headers, KPI labels (sentence case) |
| `--type-body` | `13.5px` | Table body, form text, page subtitles |
| `--type-emphasis` | `15px` | Emphasized inline text |
| `--type-section` | `20px` | Section headings |
| `--type-page` | `26px` | Page titles |
| `--type-mono` | `12px` | IDs, dates, metadata (`.mono`) |

Uppercase is reserved for eyebrows and table headers only — not KPI labels or filter chips.

### Layout primitives (`src/caliper/ui-layout.tsx`)

Public API via `@/caliper/ui`. Use these on all list/detail pages — do not invent new header/table/KPI markup.

| Primitive | Purpose |
|-----------|---------|
| `PageHeader` | Eyebrow + title + subtitle + optional actions (`hideTitle` when shell shows H1) |
| `PageToolbar` / `PageToolbarSearch` | Search + filters + primary CTA row |
| `KpiStrip` | Compact stat strip (Jobs, Runs, Results, Activity) |
| `DataTable` | Sortable table wrapper (`.jobs-table` or `.tbl` variant) |
| Detail hero | Job detail: `job-detail-hero` in ProfilesPage; run detail: `RunAccessControl` + actions |
| `PageEmpty` / `PageLoading` / `TableSkeleton` / `ListCardSkeleton` | Empty, loading, skeleton states |
| `FilterChips` | Active filter chips below KPI/filter rows |
| `ScoreTrustCard` | Unified score + bar + confidence in Results |

```css
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap');
```

### Spacing Variables

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #0369A1;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #0F172A;
  border: 2px solid #0F172A;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #F8FAFC;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #0F172A;
  outline: none;
  box-shadow: 0 0 0 3px #0F172A20;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Flat Design

**Keywords:** 2D, minimalist, bold colors, no shadows, clean lines, simple shapes, typography-focused, modern, icon-heavy

**Best For:** Web apps, mobile apps, cross-platform, startup MVPs, user-friendly, SaaS, dashboards, corporate

**Key Effects:** No gradients/shadows, simple hover (color/opacity shift), fast loading, clean transitions (150-200ms ease), minimal icons

### Page Pattern

**Pattern Name:** Real-Time / Operations Landing

- **Conversion Strategy:** For ops/security/iot products. Demo or sandbox link. Trust signals.
- **CTA Placement:** Primary CTA in nav + After metrics
- **Section Order:** 1. Hero (product + live preview or status), 2. Key metrics/indicators, 3. How it works, 4. CTA (Start trial / Contact)

---

## Anti-Patterns (Do NOT Use)

- ❌ Excessive animation
- ❌ Dark mode by default

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
