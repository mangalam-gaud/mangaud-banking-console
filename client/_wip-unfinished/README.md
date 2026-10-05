# Unfinished components

These files were moved out of `client/src` because they are **half-written and
do not parse**, and nothing in the running app imports them.

Create React App type-checks and bundles everything under `src/`, so a syntax
error in an unused file still fails `npm start` and `npm run build`. Moving
them here unblocks the app without discarding the work.

## Contents

| Path | Lines | Notes |
|---|---|---|
| `components/analytics/AdvancedAnalyticsDashboard.tsx` | ~1158 | unclosed JSX, duplicate `TrendingUp` import |
| `components/support/LiveChatSupport.tsx` | ~1351 | unclosed JSX, missing parens |
| `components/portfolio/InvestmentPortfolio.tsx` | ~856 | malformed expressions |
| `components/collaboration/SharedAccountManager.tsx` | ~644 | unclosed `Tabs`/`div` |
| `components/charts/ChartComponents.tsx` | ~567 | malformed object literals |
| `components/realtime/RealTimeDashboard.tsx` | ~480 | JSX without a single parent |
| `components/feature-flags/FeatureFlagProvider.tsx` | ~470 | unclosed JSX |
| `components/loans/LoanCalculator.tsx` | ~480 | unclosed `div` |
| `components/dashboard/DashboardStats.tsx` | ~355 | malformed object literal |
| `components/dashboard/RealtimeWidgets.tsx` | ~292 | malformed JSX |
| `components/animations/PageTransitions.tsx` | ~449 | duplicate `motion` import (needs `framer-motion`, not installed) |
| `components/notifications/NotificationSystem.tsx` | ~327 | wrong relative imports, missing `Shield`/`Button` |

## Before restoring any of them

1. Fix the syntax errors (`npx tsc --noEmit` in `client`).
2. Check its imports resolve to files that still exist — several reference
   `../utils/...` from a nested folder, which resolves outside `src`.
3. Move the folder back under `client/src/components/`.
4. Import it from a page.

Note that `client/src/types/index.ts` and `client/src/utils/*` must stay
directly under `src/`; a file in `components/<group>/` reaches them as
`../../types`, not `../types`.
