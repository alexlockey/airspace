import { sort } from "remeda";
import { EstateSnapshotService } from "@/server/features/portfolio/EstateSnapshotService";
import { BacklinkRecentLinkRepository } from "@/server/features/dashboard/repositories/BacklinkRecentLinkRepository";
import { BacklinkSnapshotRepository } from "@/server/features/dashboard/repositories/BacklinkSnapshotRepository";
import {
  selectNewCleanLinks,
  type NewCleanLink,
} from "@/server/features/portfolio/recentLinks";
import {
  GscNotConnectedError,
  GscService,
  isExpectedGrantFailure,
} from "@/server/features/gsc/services/GscService";
import { GscConnectionRepository } from "@/server/features/gsc/repositories/GscConnectionRepository";
import {
  buildStrikingDistanceRows,
  previousPeriod,
  sumSearchTotals,
} from "@/server/features/gsc/searchPerformanceReport";
import { resolveDateRange } from "@/server/features/gsc/searchAnalytics";
import { ProjectService } from "@/server/features/projects/services/ProjectService";
import {
  buildRecommendations,
  severityFromRecommendations,
  type Recommendation,
  type PortfolioSeverity,
} from "@/server/features/portfolio/RecommendationsService";
import { isIssueNeutralForSiteType } from "@/shared/siteTypeRules";
import { SITE_TYPES, type SiteType } from "@/types/schemas/projects";
import { AuthorityService } from "@/server/features/portfolio/AuthorityService";
import { PortfolioCacheRepository } from "@/server/features/portfolio/PortfolioCacheRepository";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import {
  buildTrendSummary,
  pageMovers,
  type PageMover,
} from "@/server/features/portfolio/trendSummary";

// Airspace fork: the cross-project portfolio, modelled on the Ahrefs
// dashboard: per site, health + authority + link profile + tracked keyword
// movement + real GSC clicks with a daily sparkline + recommended actions.
// Reads stored data plus free first-party GSC calls only; never triggers a
// metered DataForSEO refresh.

const DAILY_ROW_LIMIT = 200;
const PAGE_ROW_LIMIT = 500;
// The page serves the stored copy while it is younger than this; the
// scheduler re-computes it every PORTFOLIO_REFRESH_MS so a visit rarely waits.
const PORTFOLIO_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const PORTFOLIO_REFRESH_MS = 60 * 60 * 1000;
// Links shown inline on a site card; the count covers the whole stored set.
const NEW_LINKS_SHOWN = 3;
// Health model, named so tuning is one edit and reviewable.
const HEALTH_CRITICAL_BASE = 20;
const HEALTH_CRITICAL_SHARE = 20;
const HEALTH_WARNING_BASE = 6;
const HEALTH_WARNING_SHARE = 8;
const HEALTH_INFO_PENALTY = 1;
// Unseen issue types beyond the summary's top 3 still cost something.
const HEALTH_EXTRA_TYPE_PENALTY = 2;
const HEALTH_FLOOR = 5;

function toPages(rows: { keys?: string[]; clicks: number }[]) {
  return rows.map((row) => ({ page: row.keys?.[0] ?? "", clicks: row.clicks }));
}

function toSiteType(value: string): SiteType {
  return SITE_TYPES.find((candidate) => candidate === value) ?? "standard";
}

type GscSummary =
  | {
      connected: true;
      totals: ReturnType<typeof sumSearchTotals>;
      prevTotals: ReturnType<typeof sumSearchTotals>;
      daily: { date: string; clicks: number }[];
      gained: PageMover | null;
      lost: PageMover | null;
    }
  | { connected: false; errored?: boolean };

async function getGscSummary(projectId: string): Promise<GscSummary> {
  // Same window policy as the Search Performance page (resolveDateRange owns
  // the GSC data-lag handling) so the two surfaces always reconcile.
  const { startDate, endDate } = resolveDateRange({
    dateRange: "last_28_days",
  });
  const prev = previousPeriod(startDate, endDate);
  try {
    const [current, previous, currentPages, previousPages] = await Promise.all([
      GscService.getPerformance({
        projectId,
        startDate,
        endDate,
        dimensions: ["date"],
        filters: [],
        rowLimit: DAILY_ROW_LIMIT,
      }),
      GscService.getPerformance({
        projectId,
        startDate: prev.startDate,
        endDate: prev.endDate,
        dimensions: ["date"],
        filters: [],
        rowLimit: DAILY_ROW_LIMIT,
      }),
      GscService.getPerformance({
        projectId,
        startDate,
        endDate,
        dimensions: ["page"],
        filters: [],
        rowLimit: PAGE_ROW_LIMIT,
      }),
      GscService.getPerformance({
        projectId,
        startDate: prev.startDate,
        endDate: prev.endDate,
        dimensions: ["page"],
        filters: [],
        rowLimit: PAGE_ROW_LIMIT,
      }),
    ]);
    const movers = pageMovers(
      toPages(currentPages.rows),
      toPages(previousPages.rows),
    );
    const daily = sort(
      current.rows
        .map((row) => ({ date: row.keys?.[0] ?? "", clicks: row.clicks }))
        .filter((row) => row.date),
      (a, z) => a.date.localeCompare(z.date),
    );
    return {
      connected: true as const,
      totals: sumSearchTotals(current.rows),
      prevTotals: sumSearchTotals(previous.rows),
      daily,
      gained: movers.gained,
      lost: movers.lost,
    };
  } catch (error) {
    if (
      error instanceof GscNotConnectedError ||
      isExpectedGrantFailure(error)
    ) {
      return { connected: false as const };
    }
    // Rate limits and transient Google faults degrade one card, never the
    // whole estate page.
    console.error("portfolio: GSC summary failed", { projectId }, error);
    return { connected: false as const, errored: true };
  }
}

/** v1 heuristic health score, deliberately simple and explainable. Site-type
 * reinterpretation applies before scoring. Null when no COMPLETED audit
 * exists (a running crawl's partial counts would skew the share maths). */
function healthScore(
  audit: Awaited<ReturnType<typeof EstateSnapshotService.getOverview>>["audit"],
  siteType: SiteType,
): number | null {
  if (!audit || audit.status !== "completed" || audit.pagesCrawled === 0) {
    return null;
  }
  let score = 100;
  for (const issue of audit.topIssues) {
    if (isIssueNeutralForSiteType(issue.issueType, siteType)) {
      continue;
    }
    const share = Math.min(1, issue.count / audit.pagesCrawled);
    if (issue.severity === "critical") {
      score -= HEALTH_CRITICAL_BASE + HEALTH_CRITICAL_SHARE * share;
    } else if (issue.severity === "warning") {
      score -= HEALTH_WARNING_BASE + HEALTH_WARNING_SHARE * share;
    } else {
      score -= HEALTH_INFO_PENALTY;
    }
  }
  const unseenTypes = Math.max(
    0,
    audit.totalIssueTypes - audit.topIssues.length,
  );
  score -= unseenTypes * HEALTH_EXTRA_TYPE_PENALTY;
  return Math.max(HEALTH_FLOOR, Math.round(score));
}

async function getPortfolioRow(project: {
  id: string;
  name: string;
  domain: string | null;
  siteType: string;
}) {
  const siteType = toSiteType(project.siteType);
  const [overview, gscConnection, snapshots, gsc, recentLinks, authority] =
    await Promise.all([
      EstateSnapshotService.getOverview({
        projectId: project.id,
        domain: project.domain,
      }),
      GscConnectionRepository.getByProjectId(project.id),
      BacklinkSnapshotRepository.listRecentForProject(project.id, {
        domain: project.domain,
      }),
      getGscSummary(project.id),
      BacklinkRecentLinkRepository.listForProject(project.id, {
        domain: project.domain,
      }),
      AuthorityService.getAuthority(project.id, project.domain),
    ]);
  const newCleanLinks = selectNewCleanLinks(recentLinks);
  const recommendations = buildRecommendations({
    siteType,
    rank: overview.rank,
    audit: overview.audit,
    backlinks: overview.backlinks,
    gscConnected: gscConnection !== null,
  });
  const trend = buildTrendSummary({
    gsc: gsc.connected
      ? {
          connected: true,
          clicks: gsc.totals.clicks,
          prevClicks: gsc.prevTotals.clicks,
          impressions: gsc.totals.impressions,
          prevImpressions: gsc.prevTotals.impressions,
          gained: gsc.gained,
          lost: gsc.lost,
        }
      : { connected: false },
    authority,
    newCleanLinks: newCleanLinks.length,
    topAction: recommendations[0]?.title ?? null,
  });
  const hasAnyData = Boolean(
    overview.rank || overview.audit || overview.backlinks || gscConnection,
  );
  return {
    project: {
      id: project.id,
      name: project.name,
      domain: project.domain,
      siteType,
    },
    rank: overview.rank,
    audit: overview.audit,
    backlinks: overview.backlinks,
    health: healthScore(overview.audit, siteType),
    severity: severityFromRecommendations(recommendations, hasAnyData),
    gsc,
    refdomainHistory: snapshots.map((snapshot) => ({
      capturedAt: snapshot.capturedAt,
      referringDomains: snapshot.referringDomains,
    })),
    recommendations,
    authority,
    trend,
    newLinks: {
      // Null until the first daily snapshot has stored links.
      tracked: recentLinks.length > 0,
      cleanCount: newCleanLinks.length,
      shown: newCleanLinks.slice(0, NEW_LINKS_SHOWN),
    },
    loadError: false,
  };
}

async function getPortfolio(organizationId: string) {
  const projects = await ProjectService.listProjectsEnsuringOne(organizationId);
  return Promise.all(
    projects.map(async (project) => {
      try {
        return await getPortfolioRow(project);
      } catch (error) {
        // One broken project must degrade to one broken card, never a blank
        // estate page.
        console.error(
          "portfolio: row failed",
          { projectId: project.id },
          error,
        );
        return {
          project: {
            id: project.id,
            name: project.name,
            domain: project.domain,
            siteType: toSiteType(project.siteType),
          },
          rank: null,
          audit: null,
          backlinks: null,
          health: null,
          severity: "nodata" as PortfolioSeverity,
          gsc: { connected: false as const, errored: true },
          refdomainHistory: [],
          recommendations: [] as Recommendation[],
          authority: { ahrefsDr: null, dataforseoRank: null },
          trend: {
            direction: "nodata" as const,
            headline: "Failed to load",
            state: "This site's data failed to load.",
            driver: "",
            todo: "Refresh to retry.",
          },
          newLinks: {
            tracked: false,
            cleanCount: 0,
            shown: [] as NewCleanLink[],
          },
          loadError: true,
        };
      }
    }),
  );
}

/** Recommended actions for one project, including GSC striking-distance
 * opportunities. Owns all orchestration so the server function stays
 * transport-only. */
async function getProjectRecommendations(project: {
  id: string;
  domain: string | null;
  siteType: string;
}) {
  const [overview, gscConnection] = await Promise.all([
    EstateSnapshotService.getOverview({
      projectId: project.id,
      domain: project.domain,
    }),
    GscConnectionRepository.getByProjectId(project.id),
  ]);
  let strikingDistance:
    | { query: string; page: string; position: number; impressions: number }[]
    | undefined;
  if (gscConnection) {
    try {
      const { startDate, endDate } = resolveDateRange({
        dateRange: "last_28_days",
      });
      const queryPages = await GscService.getPerformance({
        projectId: project.id,
        startDate,
        endDate,
        dimensions: ["query", "page"],
        filters: [],
        rowLimit: 1000,
      });
      strikingDistance = buildStrikingDistanceRows(queryPages.rows, 3);
    } catch (error) {
      // Any GSC fault degrades to the non-GSC recommendations rather than
      // failing the card into a false all-clear.
      console.error(
        "recommendations: striking distance failed",
        { projectId: project.id },
        error,
      );
    }
  }
  return buildRecommendations({
    siteType: toSiteType(project.siteType),
    rank: overview.rank,
    audit: overview.audit,
    backlinks: overview.backlinks,
    gscConnected: gscConnection !== null,
    strikingDistance,
  });
}

export type PortfolioRowData = Awaited<ReturnType<typeof getPortfolio>>[number];
export type CachedPortfolio = {
  rows: PortfolioRowData[];
  computedAt: string;
  fromCache: boolean;
};

async function computeAndStore(organizationId: string): Promise<CachedPortfolio> {
  const rows = await getPortfolio(organizationId);
  const computedAt = new Date().toISOString();
  // A copy with a failed site is still worth serving, but never stored as the
  // "fresh" copy for six hours: the next scheduler tick retries it.
  const storedAt = rows.some((row) => row.loadError)
    ? new Date(Date.now() - PORTFOLIO_MAX_AGE_MS).toISOString()
    : computedAt;
  await PortfolioCacheRepository.put(
    organizationId,
    JSON.stringify(rows),
    storedAt,
  );
  return { rows, computedAt, fromCache: false };
}

/** The portfolio from the stored copy when it is fresh enough, otherwise
 * computed now and stored. `force` always recomputes (the Refresh button). */
async function getPortfolioCached(
  organizationId: string,
  options: { force?: boolean } = {},
): Promise<CachedPortfolio> {
  if (!options.force) {
    const cached = await PortfolioCacheRepository.get(organizationId);
    if (
      cached &&
      Date.now() - Date.parse(cached.computedAt) < PORTFOLIO_MAX_AGE_MS
    ) {
      try {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- payload is our own serialised getPortfolio output
        const rows = JSON.parse(cached.payload) as PortfolioRowData[];
        return { rows, computedAt: cached.computedAt, fromCache: true };
      } catch {
        // A corrupt copy falls through to a recompute.
      }
    }
  }
  return computeAndStore(organizationId);
}

/** Scheduler: keep every organization's stored portfolio under an hour old. */
async function refreshPortfolioCaches(): Promise<{ refreshed: number }> {
  const projects = await ProjectRepository.listActiveWithDomain();
  const organizations = [...new Set(projects.map((p) => p.organizationId))];
  let refreshed = 0;
  for (const organizationId of organizations) {
    const cached = await PortfolioCacheRepository.get(organizationId);
    if (
      cached &&
      Date.now() - Date.parse(cached.computedAt) < PORTFOLIO_REFRESH_MS
    ) {
      continue;
    }
    await computeAndStore(organizationId);
    refreshed += 1;
  }
  return { refreshed };
}

/** Drop the stored copy after a change that reshapes it (site type). */
async function invalidate(organizationId: string) {
  await PortfolioCacheRepository.clear(organizationId);
}

export const PortfolioService = {
  getPortfolio,
  getPortfolioCached,
  refreshPortfolioCaches,
  invalidate,
  getProjectRecommendations,
};
