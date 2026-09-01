import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  GscNotConnectedError,
  GscService,
  isExpectedGrantFailure,
} from "@/server/features/gsc/services/GscService";
import { buildStrikingDistanceRows } from "@/server/features/gsc/searchPerformanceReport";
import { resolveDateRange } from "@/server/features/gsc/searchAnalytics";
import { GscConnectionRepository } from "@/server/features/gsc/repositories/GscConnectionRepository";
import { DashboardService } from "@/server/features/dashboard/services/DashboardService";
import { PortfolioService } from "@/server/features/portfolio/PortfolioService";
import { buildRecommendations } from "@/server/features/portfolio/RecommendationsService";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";

// Airspace fork. Portfolio reads stored snapshots + free GSC calls only; it
// never triggers a metered DataForSEO refresh (fanning that across every
// project would multiply spend on a page meant to be glanced at daily).
export const getPortfolioOverview = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) =>
    PortfolioService.getPortfolio(context.organizationId),
  );

// Recommended actions for one project's dashboard: the portfolio rules plus
// GSC striking-distance opportunities (positions 5-20 by impressions).
export const getProjectRecommendations = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context }) => {
    const project = context.project;
    const [overview, gscConnection] = await Promise.all([
      DashboardService.getOverview({
        projectId: context.projectId,
        domain: project.domain,
      }),
      GscConnectionRepository.getByProjectId(context.projectId),
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
          projectId: context.projectId,
          startDate,
          endDate,
          dimensions: ["query", "page"],
          filters: [],
          rowLimit: 1000,
        });
        strikingDistance = buildStrikingDistanceRows(queryPages.rows, 3);
      } catch (error) {
        if (
          !(error instanceof GscNotConnectedError) &&
          !isExpectedGrantFailure(error)
        ) {
          throw error;
        }
      }
    }
    return buildRecommendations({
      siteType: project.siteType,
      domain: project.domain,
      rank: overview.rank,
      audit: overview.audit,
      backlinks: overview.backlinks,
      gscConnected: gscConnection !== null,
      strikingDistance,
    });
  });
