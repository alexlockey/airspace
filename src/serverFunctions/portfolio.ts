import { createServerFn } from "@tanstack/react-start";
import { DashboardService } from "@/server/features/dashboard/services/DashboardService";
import { GscConnectionRepository } from "@/server/features/gsc/repositories/GscConnectionRepository";
import { ProjectService } from "@/server/features/projects/services/ProjectService";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

// Portfolio reads only stored data (rank snapshots, audit results, backlink
// snapshots). It never triggers a metered DataForSEO refresh: fanning
// ensureBacklinkSnapshot out across every project would multiply spend on a
// page meant to be glanced at daily. Freshness is surfaced instead (stale flag).
export const getPortfolioOverview = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    const projects = await ProjectService.listProjectsEnsuringOne(
      context.organizationId,
    );
    return Promise.all(
      projects.map(async (project) => {
        const [overview, gsc] = await Promise.all([
          DashboardService.getOverview({
            projectId: project.id,
            domain: project.domain,
          }),
          GscConnectionRepository.getByProjectId(project.id),
        ]);
        return {
          project: {
            id: project.id,
            name: project.name,
            domain: project.domain,
          },
          rank: overview.rank,
          audit: overview.audit,
          backlinks: overview.backlinks,
          gscConnected: gsc !== null,
        };
      }),
    );
  });
