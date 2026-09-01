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
- `src/routes/api/selfhost-cron.ts` - secret-guarded endpoint driving
  scheduled rank checks + stale-audit watchdog (Cloudflare cron does not
  exist in Docker self-host; the droplet crontab POSTs every 10 minutes).
- `src/client/features/backlinks/BacklinksFilterPresets.tsx` - Clean links /
  Spam review one-click filter presets.
- `src/client/features/backlinks/DisavowExportButton.tsx` - disavow file
  generator from spam-scored loaded rows; never auto-submits.

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
| `docker-entrypoint.sh`                  | startup banner names the fork.
| `src/client/components/table/TablePagination.tsx` | optional `unitLabel` prop so grouped totals are labelled truthfully.
| `src/client/features/backlinks/BacklinksPageSections.tsx` | presets + disavow buttons wired in; reconciling links-from-domains line; mode-dependent pagination unit.
| `src/client/features/backlinks/BacklinksPageContent.tsx` | passes overview summary to the results card.
| `src/client/features/dashboard/DashboardCards.tsx` | More details link scope matches the snapshot (subdomains).
| `src/server/mcp/tools/get-backlinks-profile.ts` | grouped totals labelled as referring domains.                                                                                                                                                |

## v1.3: site-type paradigm

- `projects.site_type` column (standard | job_board | directory), both
  dialects, migrations drizzle/0043 + drizzle-pg/0021.
- `setProjectSiteType` server fn/service/repository; Site type select in
  project General settings.
- Portfolio: type badge; job_board rows reinterpret 404/broken-page audit
  issue types as neutral (inventory churn), per the Chukovski rubric in the
  OS repo (projects/seo-geo-platform/research/).

## v1.4: Portfolio 2.0 + recommendations

- `src/server/features/portfolio/{PortfolioService,RecommendationsService}.ts`
  - health score (typed, explainable heuristic), free GSC daily series +
  prev-period totals, refdomain history, rule-based evidence-cited
  recommendations (site-type aware).
- `src/serverFunctions/portfolio.ts` - portfolio fn + getProjectRecommendations
  (adds GSC striking-distance opportunities).
- `src/routes/_app/portfolio.tsx` - Ahrefs-style site cards with sparklines.
- `src/client/components/Sparkline.tsx`, 
  `src/client/features/dashboard/RecommendedActionsCard.tsx` (wired into
  DashboardPage below the checklist).
- `BacklinkSnapshotRepository.listRecentForProject`.

## v1.5: review-pass fixes (Fable 5.1 audit, 10 confirmed findings)

- `src/shared/siteTypeRules.ts` - the site-type neutral-issue map keyed by the
  REAL audit issue registry (the v1.3 regex matched 1 of 27 keys); both
  services import it. `src/shared/brand.ts` - single brand identity, wired
  into Sidebar/AppShell/MCP server; onboarding + OAuth-consent logos and the
  MCP name/website/icon rebranded (tests updated).
- Portfolio resilience: per-project isolation (one failed site = one error
  card), GSC faults degrade with an errored state, severity computed
  server-side from the recommendations, health only from completed audits
  plus an unseen-issue-types penalty, resolveDateRange (3-day lag) replaces
  the hand-rolled 2-day window, ref-domain deltas show gains AND losses,
  snapshot history is domain-guarded.
- Recommendations: orchestration moved into PortfolioService (server fn is
  transport-only), striking-distance failures degrade instead of failing the
  card, the card links each action to its target page and shows errors
  instead of a false all-clear; cache invalidated on snapshot refresh and
  site-type change.
- `src/server/features/cron/runCronTick.ts` - scheduled body extracted;
  server.ts and /api/selfhost-cron both call it; the route now uses
  getEnvValueSync, constant-time secret comparison, and a distinct 503 for a
  too-short secret.
- Disavow: partial-coverage detection (file warning + PARTIAL filename +
  amber badge when the filtered set exceeds loaded rows) and the house
  downloadFile helper; backlinks reconciling line says when totals are
  unfiltered.
- siteType typed as the SiteType union end to end; DashboardRankSummary
  exported and imported; tests added for buildRecommendations/severity.

## Deliberately NOT rebranded

- `/ai` MCP setup page, help pages, plugin/skill directories, package name,
  env var names (OPENSEO_TELEMETRY_DISABLED etc): these document real
  commands and upstream identifiers; renaming them would break accuracy and
  guarantee merge churn.
- Binary favicons (ico/png set): superseded in modern browsers by the svg
  link; regenerate properly in a later polish pass.
