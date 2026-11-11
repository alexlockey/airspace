import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PortfolioService } from "@/server/features/portfolio/PortfolioService";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";

// Airspace fork. Portfolio reads stored snapshots + free GSC calls only; it
// never triggers a metered DataForSEO refresh (fanning that across every
// project would multiply spend on a page meant to be glanced at daily).
// Served from the stored copy (refreshed hourly by the scheduler) so the page
// opens instantly; `force` recomputes on the Refresh button.
export const getPortfolioOverview = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ force: z.boolean().optional() }).optional())
  .handler(async ({ context, data }) =>
    PortfolioService.getPortfolioCached(context.organizationId, {
      force: data?.force === true,
    }),
  );

// One project's trend lines and authority for its dashboard, from the same
// stored portfolio copy.
export const getProjectTrend = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context }) => {
    const portfolio = await PortfolioService.getPortfolioCached(
      context.organizationId,
    );
    const row = portfolio.rows.find(
      (candidate) => candidate.project.id === context.project.id,
    );
    return row
      ? {
          trend: row.trend,
          authority: row.authority,
          computedAt: portfolio.computedAt,
        }
      : null;
  });

// Recommended actions for one project's dashboard. Transport-only; the
// orchestration lives in PortfolioService.
export const getProjectRecommendations = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context }) =>
    PortfolioService.getProjectRecommendations(context.project),
  );
