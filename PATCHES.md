# Airspace fork patches

Fork of every-app/open-seo for Alex Lockey's estate. Upstream sync policy:
monthly minimum, sooner for security fixes (see the OS repo's locked plan,
section 6.1). This file lists every deliberate divergence so merges are
mechanical: after `git merge upstream/main`, re-check each item below.

## New files (never conflict)

- `src/routes/_app/portfolio.tsx` - the Portfolio page (cross-project estate
  table, severity-sorted, colour-state chips).
- `src/serverFunctions/portfolio.ts` - `getPortfolioOverview`: fans
  `DashboardService.getOverview` + GSC connection status across all projects.
  Reads stored snapshots only; deliberately never calls
  `ensureBacklinkSnapshot` (metered).
- `public/favicon.svg` - Airspace radar mark.
- `PATCHES.md` - this file.

## Edited upstream files (re-apply on conflict)

| File                                    | Change                                                                                                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/client/styles/app.css`             | `--status-*` colour tokens in `:root` + dark override, plus `.status-chip*`, `.status-row-*`, `.status-dot*`, `.text-status-*` utilities. Appended blocks; low conflict risk. |
| `src/routes/__root.tsx`                 | title "Airspace"; svg favicon link added first in `links`.                                                                                                                    |
| `src/client/components/Sidebar.tsx`     | wordmark "Airspace"; `estateNavGroup` imported and prepended to `navGroups`.                                                                                                  |
| `src/client/layout/AppShell.tsx`        | mobile top-bar wordmark "Airspace".                                                                                                                                           |
| `src/client/navigation/items.ts`        | `Radar` icon import; `portfolioNavItem` + exported `estateNavGroup`.                                                                                                          |
| `src/client/features/auth/AuthPage.tsx` | logo img -> /favicon.svg, alt "Airspace".                                                                                                                                     |
| `public/site.webmanifest`               | name/short_name "Airspace", theme colours #1E1B2E.                                                                                                                            |
| `docker-entrypoint.sh`                  | startup banner names the fork.                                                                                                                                                |

## Deliberately NOT rebranded

- `/ai` MCP setup page, help pages, plugin/skill directories, package name,
  env var names (OPENSEO_TELEMETRY_DISABLED etc): these document real
  commands and upstream identifiers; renaming them would break accuracy and
  guarantee merge churn.
- Binary favicons (ico/png set): superseded in modern browsers by the svg
  link; regenerate properly in a later polish pass.
