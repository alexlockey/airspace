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
- `src/public/favicon.svg` - Airspace radar mark (upstream moved public/ under src/).
- `PATCHES.md` - this file.
- `src/routes/api/selfhost-cron.ts` - secret-guarded endpoint driving
  scheduled rank checks + stale-audit watchdog (Cloudflare cron does not
  exist in Docker self-host; the droplet crontab POSTs every 10 minutes).
- `src/client/features/backlinks/BacklinksFilterPresets.tsx` - Clean links /
  Spam review one-click filter presets.
- `src/client/features/backlinks/DisavowExportButton.tsx` - disavow file
  generator from spam-scored loaded rows; never auto-submits.

## Edited upstream files (re-apply on conflict)

| File                                                      | Change                                                                                                                                                                        |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/client/styles/app.css`                               | `--status-*` colour tokens in `:root` + dark override, plus `.status-chip*`, `.status-row-*`, `.status-dot*`, `.text-status-*` utilities. Appended blocks; low conflict risk. |
| `src/routes/__root.tsx`                                   | title "Airspace"; svg favicon link added first in `links`.                                                                                                                    |
| `src/client/components/Sidebar.tsx`                       | wordmark "Airspace"; `estateNavGroup` imported and prepended to `navGroups`.                                                                                                  |
| `src/client/layout/AppShell.tsx`                          | mobile top-bar wordmark "Airspace".                                                                                                                                           |
| `src/client/navigation/items.ts`                          | `Radar` icon import; `portfolioNavItem` + exported `estateNavGroup`.                                                                                                          |
| `src/client/features/auth/AuthPage.tsx`                   | logo img -> /favicon.svg, alt "Airspace".                                                                                                                                     |
| `public/site.webmanifest`                                 | name/short_name "Airspace", theme colours #1E1B2E.                                                                                                                            |
| `deploy/docker/docker-entrypoint.sh`                      | startup banner names the fork.                                                                                                                                                |
| `src/client/components/table/TablePagination.tsx`         | optional `unitLabel` prop so grouped totals are labelled truthfully.                                                                                                          |
| `src/client/features/backlinks/BacklinksPageSections.tsx` | presets + disavow buttons wired in; reconciling links-from-domains line; mode-dependent pagination unit.                                                                      |
| `src/client/features/backlinks/BacklinksPageContent.tsx`  | passes overview summary to the results card.                                                                                                                                  |
| `src/client/features/dashboard/DashboardCards.tsx`        | More details link scope matches the snapshot (subdomains).                                                                                                                    |
| `src/server/mcp/tools/get-backlinks-profile.ts`           | grouped totals labelled as referring domains.                                                                                                                                 |

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

## v1.6: new clean links on the portfolio + daily snapshot cron

- `src/shared/backlinkQuality.ts` - CLEAN_LINK_MAX_SPAM_SCORE (29),
  NEW_LINK_WINDOW_DAYS (30), RECENT_LINKS_STORED (20); the Backlinks presets
  now import the clean threshold instead of hard-coding it.
- `backlink_recent_links` table (both dialects; drizzle/0044,
  drizzle-pg/0022) + `BacklinkRecentLinkRepository` (replace-per-project,
  domain-guarded newest-first read).
- `DashboardService.ensureBacklinkSnapshot` also fetches the 20 newest live
  links (one per domain) with each new summary snapshot and stores them;
  failure degrades to a log line so the paid summary is never rolled back.
- `dailySnapshotRefresh.ts` runs from `runCronTick`: refreshes stale (>24h)
  snapshots for every active project with a domain, max 3 per tick, so the
  portfolio no longer depends on dashboard visits. Kill switch:
  `AIRSPACE_DAILY_SNAPSHOTS=off`. `ProjectRepository.listActiveWithDomain`.
- `recentLinks.ts` (`selectNewCleanLinks`, tested): clean = spam score <=
  29 AND first seen within 30 days; unscored rows are not clean.
- Portfolio card: green "+N new clean links" chip, top 3 linking domains as
  external links to the linking page with target path, spam score and age,
  and an "All recent links" link into the Backlinks page sorted newest
  first. Muted state when nothing is new; explanatory state before the
  first snapshot.
- v1.6.1/2: the rows filter must be NESTED (`[["is_lost","=",false]]`)
  because fetchBacklinksRows appends its default spam condition with
  "and"; the daily job self-heals a fresh snapshot with no stored links via
  `DashboardService.backfillRecentLinks` (links-only, one rows call). v1.6.3: inserts chunked to 7 rows (D1 caps bound parameters at 100 per statement; the error surfaces only as a bare DrizzleQueryError).
- v1.6.4 (26 Oct 2026): self-heal REMOVED. A domain with zero backlinks
  stores no rows, so the self-heal re-paid for the same empty rows call on
  every cron tick (~$7/day of DataForSEO). A fresh snapshot is now always
  skipped; links refresh only with the next daily snapshot. The droplet
  also runs with `AIRSPACE_DAILY_SNAPSHOTS=off` (env file
  `/root/openseo/airspace.env`) and all rank trackers paused, so DataForSEO
  is spent on demand only.

## v1.7: Google service account + estate MCP tools (9 Nov 2026)

- Why: the self-hosted OAuth client sat in Google's Testing status, which caps
  refresh tokens at seven days, so every GSC and GA4 grant died weekly and
  every session asked to reconnect. GA4 had never been bound to a project.
- `src/server/lib/googleServiceAccount.ts` (+ test): RS256 JWT via Web Crypto
  (runs in workerd and Node), jwt-bearer token exchange, per-scope cache.
  Configured by `AIRSPACE_GOOGLE_SA_JSON_B64`. Sentinel account id
  `service-account` marks a connection as service-account owned.
- `src/server/lib/gscClient.ts`, `src/server/lib/ga4Client.ts`: a connection
  whose account id is the sentinel mints a service-account token instead of
  asking Better Auth. OAuth connections are untouched (upstream path intact).
- `src/server/features/google/{serviceAccountMatching,ServiceAccountBindingService}.ts`
  (+ test): binds every project with a domain to the GSC site (domain property
  first) and GA4 property (by web-stream host) the service account can see.
  Runs from `runCronTick` at most every six hours, and on demand.
- MCP: `get_portfolio` (free estate overview from PortfolioService, used by
  the Airspace Weekly runner) and `bind_google_service_account`, in
  `src/server/mcp/tools/airspace-estate-tools.ts`, registered in server.ts.

## v1.8: upstream sync (11 Nov 2026, upstream 46b815be)

569 upstream commits merged (fork point c469a48a, 23 Aug). 38 conflicts. What
moved, so the next sync is mechanical:

- Migrations live in `drizzle/sqlite` and `drizzle/pg` now. The fork's two
  schema changes (projects.site_type, backlink_recent_links) are ONE migration
  after upstream's: `drizzle/sqlite/0069_airspace_fork_tables.sql` and
  `drizzle/pg/0047_airspace_fork_tables.sql`. The old 0043_clammy_bromley and
  0044_talented_swordsman files are gone. A database that already ran them
  (the droplet) must get a `d1_migrations` row for
  `0069_airspace_fork_tables.sql` BEFORE the new image starts, or the migrate
  step fails on the duplicate column. Next sync: if upstream has passed 0069,
  regenerate ours as the new last number and repeat the row insert.
- Upstream #872 removed the stored backlink snapshot and rank summary from
  `DashboardService` and deleted `BacklinkSnapshotRepository`. Both are
  fork-owned now: `BacklinkSnapshotRepository.ts` kept as is, and
  `src/server/features/portfolio/EstateSnapshotService.ts` holds getOverview
  (rank + upstream audit summary + totalIssueTypes + backlinks),
  getRankSummary, getBacklinkSummary, ensureBacklinkSnapshot and
  refreshRecentLinks. `DashboardService.ts` is byte-identical to upstream.
  PortfolioService, RecommendationsService and dailySnapshotRefresh import
  the new service.
- Upstream ported the UI from daisyUI to shadcn/Tailwind tokens. Fork UI
  ported: portfolio.tsx, RecommendedActionsCard, DisavowExportButton use
  bg-card / bg-muted / border-border / text-muted-foreground. The
  `BacklinksFilterPresets` component is REMOVED: upstream's Best links menu
  (hide spam) covers the Clean links preset; the Spam review view is the
  backlinks filter panel with spam score >= 30. DisavowExportButton sits in
  upstream's new toolbar beside the actions menu. The Recommended actions
  card sits above upstream's dashboard tabs.
- `runCronTick` mirrors upstream's scheduled body (watchdog, then rank
  checks, AI visibility and first-audit emails side by side) plus the fork's
  snapshot refresh and service-account binding. server.ts calls it.
- Upstream's single-container image (now `deploy/docker/Dockerfile`, entrypoint
  `deploy/docker/docker-entrypoint.sh`) runs its own five-minute scheduler
  (`scripts/selfhost-scheduler.mjs`) against the Workers scheduled handler.
  The droplet crontab POST to /api/selfhost-cron is therefore redundant and is
  removed at cutover; the route stays for on-demand ticks.
- Google: upstream moved token minting to `getGoogleAccessToken` plus a
  gateway mode. The service-account branch sits in `getToken` (GSC) and
  `getGa4AccessToken` (GA4), and both `authenticated` helpers skip gateway
  mode for the sentinel account.
- MCP: `get_portfolio` and `bind_google_service_account` are registered in
  `createMcpServer` after `registerOpenSeoTools`, NOT inside it, so the Every
  App gateway catalog test (fixed tool count) stays upstream's. Output schemas
  use `z.looseObject` (upstream contract test).
- Upstream lib target is below ES2023 while lint demands non-mutating sorts:
  use remeda `sort`/`reverse`, never `toSorted`/`toReversed`.
- Site type: upstream replaced setProjectDomain/setProjectMarket with
  setProjectWebsite; `setProjectSiteType` (schema, repository, service, server
  fn) and the Site type select are re-added on top. KeywordSuggestionService
  test fixture gains `siteType`.
- Branding re-applied on the new shadcn sidebar, mobile bar, OAuth consent,
  entrypoint banner and MCP server identity (all via `BRAND`).

## Deliberately NOT rebranded

- `/ai` MCP setup page, help pages, plugin/skill directories, package name,
  env var names (OPENSEO_TELEMETRY_DISABLED etc): these document real
  commands and upstream identifiers; renaming them would break accuracy and
  guarantee merge churn.
- Binary favicons (ico/png set): superseded in modern browsers by the svg
  link; regenerate properly in a later polish pass.
