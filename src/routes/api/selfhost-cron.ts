import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { runCronTick } from "@/server/features/cron/runCronTick";
import { getEnvValueSync } from "@/server/lib/runtime-env";

const MIN_SECRET_LENGTH = 16;

// Constant-time comparison: this is an unauthenticated route whose only gate
// is the shared secret (same pattern as the GDPR erasure webhook).
function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

// Airspace fork: the upstream `scheduled` handler only fires on Cloudflare
// cron triggers, which do not exist in the Docker self-host (vite preview is
// fetch-only), so scheduled rank checks and the stale-audit watchdog never
// run there. This route lets an external cron (the droplet's crontab) drive
// the same runCronTick the Workers handler uses. Guarded by
// SELFHOST_CRON_SECRET; absent secret means the route pretends not to exist,
// while a configured-but-too-short secret fails loudly so misconfiguration
// is diagnosable from the crontab log.
async function handleCronRequest(request: Request): Promise<Response> {
  const secret = getEnvValueSync(env, "SELFHOST_CRON_SECRET");
  if (!secret) {
    return new Response("Not found", { status: 404 });
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    console.error(
      `[selfhost-cron] SELFHOST_CRON_SECRET is shorter than ${MIN_SECRET_LENGTH} characters; refusing to run.`,
    );
    return Response.json(
      { status: "misconfigured", detail: "cron secret too short" },
      { status: 503 },
    );
  }
  const provided = request.headers.get("x-cron-secret") ?? "";
  if (!timingSafeEqual(provided, secret)) {
    return new Response("Forbidden", { status: 403 });
  }

  const { watchdogError } = await runCronTick(env);
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
