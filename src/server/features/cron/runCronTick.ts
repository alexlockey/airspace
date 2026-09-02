import { withPgClient } from "@/db";
import { reconcileStaleAudits } from "@/server/features/audit/services/auditReconciler";
import { refreshStaleBacklinkSnapshots } from "@/server/features/dashboard/services/dailySnapshotRefresh";
import { runScheduledRankChecks } from "@/server/features/rank-tracking/services/scheduledRankChecks";

// Airspace fork: the non-purge cron body, extracted so the Workers scheduled
// handler and the Docker self-host cron route run EXACTLY the same jobs. Any
// upstream addition to the tick belongs here, and reaches both runtimes.
export async function runCronTick(
  env: Env,
): Promise<{ watchdogError: unknown }> {
  // Watchdog first: reconcile audits stuck in "running" whose workflow died.
  // Its failure is held so it cannot suppress the rank checks, then surfaced.
  let watchdogError: unknown;
  try {
    await withPgClient(() => reconcileStaleAudits());
  } catch (err) {
    watchdogError = err;
    console.error("[cron] Stale-audit reconcile failed:", err);
  }
  await withPgClient(() => runScheduledRankChecks(env));
  // Airspace fork: keeps portfolio link data (incl. new clean links) daily
  // fresh. Held like the watchdog so it can never suppress the jobs above.
  try {
    await withPgClient(() => refreshStaleBacklinkSnapshots(env));
  } catch (err) {
    console.error("[cron] Daily backlink snapshot refresh failed:", err);
  }
  return { watchdogError };
}
