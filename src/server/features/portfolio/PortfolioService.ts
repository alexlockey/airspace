import { DashboardService } from "@/server/features/dashboard/services/DashboardService";
import { BacklinkSnapshotRepository } from "@/server/features/dashboard/repositories/BacklinkSnapshotRepository";
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

// Airspace fork: the cross-project portfolio, modelled on the Ahrefs
// dashboard: per site, health + authority + link profile + tracked keyword
// movement + real GSC clicks with a daily sparkline + recommended actions.
// Reads stored data plus free first-party GSC calls only; never triggers a
// metered DataForSEO refresh.

const DAILY_ROW_LIMIT = 200;
// Health model, named so tuning is one edit and reviewable.
const HEALTH_CRITICAL_BASE = 20;
const HEALTH_CRITICAL_SHARE = 20;
const HEALTH_WARNING_BASE = 6;
const HEALTH_WARNING_SHARE = 8;
const HEALTH_INFO_PENALTY = 1;
// Unseen issue types beyond the summary's top 3 still cost something.
const HEALTH_EXTRA_TYPE_PENALTY = 2;
const HEALTH_FLOOR = 5;

function toSiteType(value: string): SiteType {
  return SITE_TYPES.find((candidate) => candidate === value) ?? "standard";
}

type GscSummary =
  | {
      connected: true;
      totals: ReturnType<typeof sumSearchTotals>;
      prevTotals: ReturnType<typeof sumSearchTotals>;
      daily: { date: string; clicks: number }[];
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
    const [current, previous] = await Promise.all([
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
    ]);
    const daily = current.rows
      .map((row) => ({ date: row.keys?.[0] ?? "", clicks: row.clicks }))
      .filter((row) => row.date)
      .toSorted((a, z) => a.date.localeCompare(z.date));
    return {
      connected: true as const,
      totals: sumSearchTotals(current.rows),
      prevTotals: sumSearchTotals(previous.rows),
      daily,
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
  audit: Awaited<ReturnType<typeof DashboardService.getOverview>>["audit"],
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
  const [overview, gscConnection, snapshots, gsc] = await Promise.all([
    DashboardService.getOverview({
      projectId: project.id,
      domain: project.domain,
    }),
    GscConnectionRepository.getByProjectId(project.id),
    BacklinkSnapshotRepository.listRecentForProject(project.id, {
      domain: project.domain,
    }),
    getGscSummary(project.id),
  ]);
  const recommendations = buildRecommendations({
    siteType,
    rank: overview.rank,
    audit: overview.audit,
    backlinks: overview.backlinks,
    gscConnected: gscConnection !== null,
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
    DashboardService.getOverview({
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

export const PortfolioService = { getPortfolio, getProjectRecommendations };
