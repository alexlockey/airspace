import { EstateSnapshotService } from "@/server/features/portfolio/EstateSnapshotService";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { getEnvValueSync } from "@/server/lib/runtime-env";

// Airspace fork: the portfolio flags new links, so snapshots must refresh
// without anyone opening each project dashboard. ensureBacklinkSnapshot is
// a no-op while the latest snapshot is under a day old, so calling it from
// every cron tick costs one summary + one rows call per project per day.
// Bounded per tick so a cold start spreads the metered calls over a few
// ticks instead of one burst.
const MAX_REFRESHES_PER_TICK = 3;

export async function refreshStaleBacklinkSnapshots(env: object): Promise<{
  refreshed: number;
  failed: number;
}> {
  // Kill switch: AIRSPACE_DAILY_SNAPSHOTS=off returns the estate to
  // visit-triggered refreshes only.
  if (getEnvValueSync(env, "AIRSPACE_DAILY_SNAPSHOTS") === "off") {
    return { refreshed: 0, failed: 0 };
  }
  const projects = await ProjectRepository.listActiveWithDomain();
  let refreshed = 0;
  let failed = 0;
  for (const project of projects) {
    if (refreshed + failed >= MAX_REFRESHES_PER_TICK) break;
    const billingCustomer = {
      userId: "system",
      userEmail: "system@openseo.so",
      organizationId: project.organizationId,
      projectId: project.id,
    };
    try {
      const before = await EstateSnapshotService.getOverview({
        projectId: project.id,
        domain: project.domain,
      });
      // A fresh summary is never re-fetched here, even with no stored links:
      // a domain with zero backlinks stores nothing, so a links-only
      // "self-heal" re-paid for the same empty rows call on every tick
      // (~$7/day, Oct 2026). Links refresh with the next daily snapshot.
      if (before.backlinks && !before.backlinks.stale) continue;
      await EstateSnapshotService.ensureBacklinkSnapshot({
        projectId: project.id,
        domain: project.domain,
        billingCustomer,
      });
      refreshed += 1;
    } catch (error) {
      failed += 1;
      console.error(
        "[cron] backlink snapshot refresh failed",
        { projectId: project.id },
        error,
      );
    }
  }
  return { refreshed, failed };
}
