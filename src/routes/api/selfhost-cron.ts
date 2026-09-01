import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { withPgClient } from "@/db";
import { reconcileStaleAudits } from "@/server/features/audit/services/auditReconciler";
import { runScheduledRankChecks } from "@/server/features/rank-tracking/services/scheduledRankChecks";

// Airspace fork: the upstream `scheduled` handler only fires on Cloudflare
// cron triggers, which do not exist in the Docker self-host (vite preview is
// fetch-only), so scheduled rank checks and the stale-audit watchdog never
// run there. This route lets an external cron (the droplet's crontab) drive
// the same code path. Guarded by SELFHOST_CRON_SECRET; when the secret is
// unset the route pretends not to exist.
async function handleCronRequest(request: Request): Promise<Response> {
  const parsed = z
    .object({ SELFHOST_CRON_SECRET: z.string().min(16) })
    .safeParse(env);
  if (!parsed.success) {
    return new Response("Not found", { status: 404 });
  }
  const secret = parsed.data.SELFHOST_CRON_SECRET;
  const provided = request.headers.get("x-cron-secret");
  if (provided !== secret) {
    return new Response("Forbidden", { status: 403 });
  }

  // Mirror the upstream scheduled handler: watchdog first, its failure held
  // so it cannot suppress the rank checks, then rethrown into the response.
  let watchdogError: unknown;
  try {
    await withPgClient(() => reconcileStaleAudits());
  } catch (err) {
    watchdogError = err;
    console.error("[selfhost-cron] Stale-audit reconcile failed:", err);
  }
  await withPgClient(() => runScheduledRankChecks(env));
  if (watchdogError) {
    return Response.json(
      { status: "partial", detail: "rank checks ran; audit reconcile failed" },
      { status: 500 },
    );
  }
  return Response.json({ status: "ok" });
}

export const Route = createFileRoute("/api/selfhost-cron")({
  server: {
    handlers: {
      POST: ({ request }) => handleCronRequest(request),
    },
  },
});
