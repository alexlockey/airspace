import { withPgClient } from "@/db";
import { reconcileStaleAudits } from "@/server/features/audit/services/auditReconciler";
import { sendFirstAuditEmails } from "@/server/features/audit/services/firstAuditEmails";
import { refreshStaleBacklinkSnapshots } from "@/server/features/dashboard/services/dailySnapshotRefresh";
import { ServiceAccountBindingService } from "@/server/features/google/ServiceAccountBindingService";
import { AuthorityService } from "@/server/features/portfolio/AuthorityService";
import { PortfolioService } from "@/server/features/portfolio/PortfolioService";
import { runScheduledRankChecks } from "@/server/features/rank-tracking/services/scheduledRankChecks";

// Airspace fork: the non-purge cron body, extracted so the Workers scheduled
// handler and the Docker self-host cron route run EXACTLY the same jobs. Any
// upstream addition to the tick belongs here, and reaches both runtimes.
// Upstream body as of the Nov 2026 sync: watchdog, then rank checks, AI
// visibility and first-audit emails side by side; a rejected job is rethrown.
export async function runCronTick(
  env: Env,
): Promise<{ watchdogError: unknown }> {
  // Watchdog first: reconcile audits stuck in "running" whose workflow died.
  // Its failure is held so it cannot suppress the jobs below, then surfaced.
  let watchdogError: unknown;
  try {
    await withPgClient(() => reconcileStaleAudits());
  } catch (err) {
    watchdogError = err;
    console.error("[cron] Stale-audit reconcile failed:", err);
  }
  const checks = await Promise.allSettled([
    withPgClient(() => runScheduledRankChecks(env)),
    withPgClient(async () => {
      const { runScheduledAiVisibility } =
        await import("@/server/features/ai-visibility/services/scheduledAiVisibility");
      await runScheduledAiVisibility();
    }),
    withPgClient(() => sendFirstAuditEmails()),
  ]);
  // Airspace fork: keeps portfolio link data (incl. new clean links) daily
  // fresh. Held like the watchdog so it can never suppress the jobs above.
  try {
    await withPgClient(() => refreshStaleBacklinkSnapshots(env));
  } catch (err) {
    console.error("[cron] Daily backlink snapshot refresh failed:", err);
  }
  // Airspace fork: keep every project bound to the Google service account
  // (throttled to six hours inside the service). Never blocks the jobs above.
  try {
    await withPgClient(() => ServiceAccountBindingService.bindIfDue());
  } catch (err) {
    console.error("[cron] Google service-account binding failed:", err);
  }
  // Airspace fork: monthly authority history (a couple of sites per tick,
  // each at most every 28 days; kill switch AIRSPACE_AUTHORITY_HISTORY=off).
  try {
    await withPgClient(() => AuthorityService.refreshDueHistories(env));
  } catch (err) {
    console.error("[cron] Authority history refresh failed:", err);
  }
  // Airspace fork: keep the stored portfolio under an hour old so the page
  // opens without waiting on Search Console.
  try {
    await withPgClient(() => PortfolioService.refreshPortfolioCaches());
  } catch (err) {
    console.error("[cron] Portfolio cache refresh failed:", err);
  }
  for (const result of checks)
    if (result.status === "rejected") throw result.reason;
  return { watchdogError };
}
