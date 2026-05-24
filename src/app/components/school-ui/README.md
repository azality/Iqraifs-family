# school-ui

Visual primitives for the school product, matching the franchise-style
aesthetic from the Performance Dashboard (`src/app/pages/school/PerformanceDashboard.tsx`):
dark slate→indigo gradient hero, dense KPI tiles, severity-colored alerts,
status pills, and compact leaderboard tables.

Use these instead of raw shadcn cards/tables when building school pages so
the look stays consistent and a single tweak to `tokens.ts` re-skins
everything.

Primitives:

- `HeroCard` — dark-gradient hero block (top of dashboard pages)
- `KpiTile` — single KPI tile (`dark` for inside HeroCard, `light` for standalone)
- `AlertCard` — severity-colored alert (`critical | warning | info | success`)
- `StatusPill` — inline status pill (`compliant | watch | flagged | neutral`)
- `DataTable` — dense data-grid wrapper around shadcn `Table`

Tokens (`tokens.ts`):

- Color helpers: `heroGradient`, `heroBorder`, `cardBase`, `cardElev`, `accentBg/Text/Border`
- `severityClasses(s)` and `statusClasses(s)` return matched
  `{ bg, border, title, icon, badge }` Tailwind class strings
- Typography: `pageTitleClasses`, `sectionTitleClasses`, `mutedClasses`

A live preview is mounted at `/school/_design` (see `_DesignSystemPreview.tsx`).
