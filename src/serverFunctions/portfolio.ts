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
export const getPortfolioOverview = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) =>
    PortfolioService.getPortfolio(context.organizationId),
  );

// Recommended actions for one project's dashboard. Transport-only; the
// orchestration lives in PortfolioService.
export const getProjectRecommendations = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context }) =>
    PortfolioService.getProjectRecommendations(context.project),
  );
