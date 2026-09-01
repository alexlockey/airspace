import { DashboardService } from "@/server/features/dashboard/services/DashboardService";
import { BacklinkSnapshotRepository } from "@/server/features/dashboard/repositories/BacklinkSnapshotRepository";
import {
  GscNotConnectedError,
  GscService,
  isExpectedGrantFailure,
} from "@/server/features/gsc/services/GscService";
import { GscConnectionRepository } from "@/server/features/gsc/repositories/GscConnectionRepository";
import {
  previousPeriod,
  sumSearchTotals,
} from "@/server/features/gsc/searchPerformanceReport";
import { ProjectService } from "@/server/features/projects/services/ProjectService";
import { buildRecommendations } from "@/server/features/portfolio/RecommendationsService";

// Airspace fork: the cross-project portfolio, modelled on the Ahrefs
// dashboard: per site, health + authority + link profile + tracked keyword
// movement + real GSC clicks with a daily sparkline + recommended actions.
// Reads stored data plus free first-party GSC calls only; never triggers a
// metered DataForSEO refresh.

const GSC_WINDOW_DAYS = 28;
const DAILY_ROW_LIMIT = 60;

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function getGscSummary(projectId: string) {
  // GSC data lags ~2 days; end the window there so the last points are real.
  const endDate = isoDaysAgo(2);
  const startDate = isoDaysAgo(2 + GSC_WINDOW_DAYS - 1);
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
    throw error;
  }
}

/** v1 heuristic health score, deliberately simple and explainable: start at
 * 100, subtract per issue TYPE by severity, weighted by how much of the crawl
 * it touches. Site-type reinterpretation applies before scoring (job boards:
 * 404-class churn is inventory lifecycle). Null when no audit has run. */
const JOB_BOARD_NEUTRAL_ISSUE = /404|not.?found|broken.?(link|page)/i;

function healthScore(
  audit: Awaited<ReturnType<typeof DashboardService.getOverview>>["audit"],
  siteType: string,
): number | null {
  if (!audit || audit.pagesCrawled === 0) return null;
  let score = 100;
  for (const issue of audit.topIssues) {
    if (
      siteType === "job_board" &&
      JOB_BOARD_NEUTRAL_ISSUE.test(issue.issueType)
    ) {
      continue;
    }
    const share = Math.min(1, issue.count / audit.pagesCrawled);
    if (issue.severity === "critical") score -= 20 + 20 * share;
    else if (issue.severity === "warning") score -= 6 + 8 * share;
    else score -= 1;
  }
  return Math.max(5, Math.round(score));
}

async function getPortfolio(organizationId: string) {
  const projects = await ProjectService.listProjectsEnsuringOne(organizationId);
  return Promise.all(
    projects.map(async (project) => {
      const [overview, gscConnection, snapshots] = await Promise.all([
        DashboardService.getOverview({
          projectId: project.id,
          domain: project.domain,
        }),
        GscConnectionRepository.getByProjectId(project.id),
        BacklinkSnapshotRepository.listRecentForProject(project.id),
      ]);
      const gsc = gscConnection
        ? await getGscSummary(project.id)
        : { connected: false as const };
      const recommendations = buildRecommendations({
        siteType: project.siteType,
        domain: project.domain,
        rank: overview.rank,
        audit: overview.audit,
        backlinks: overview.backlinks,
        gscConnected: gscConnection !== null,
      });
      return {
        project: {
          id: project.id,
          name: project.name,
          domain: project.domain,
          siteType: project.siteType,
        },
        rank: overview.rank,
        audit: overview.audit,
        backlinks: overview.backlinks,
        health: healthScore(overview.audit, project.siteType),
        gscConnected: gscConnection !== null,
        gsc,
        refdomainHistory: snapshots.map((snapshot) => ({
          capturedAt: snapshot.capturedAt,
          referringDomains: snapshot.referringDomains,
        })),
        recommendations,
      };
    }),
  );
}

export const PortfolioService = { getPortfolio };
