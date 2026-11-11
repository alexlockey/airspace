import { AuthorityRepository } from "@/server/features/portfolio/AuthorityRepository";
import {
  summarizeAuthority,
  type AuthoritySummary,
} from "@/server/features/portfolio/authoritySummary";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import {
  createDataforseoClient,
  normalizeBacklinksTarget,
} from "@/server/lib/dataforseo";
import { getEnvValueSync } from "@/server/lib/runtime-env";

// Airspace fork: authority over time. DataForSEO's backlinks history gives a
// monthly domain rank (0-100) for the last year in one call (about $0.04 per
// site); it is re-fetched at most every 28 days per site, a few sites per
// cron tick. Ahrefs Domain Rating points are recorded through the MCP tool
// whenever a session captures them (the free Ahrefs endpoint is session-only).

const REFRESH_EVERY_DAYS = 28;
const MAX_FETCHES_PER_TICK = 2;
const HISTORY_DAYS = 365;
const DAY_MS = 86_400_000;

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function refreshDueHistories(env: object): Promise<{
  fetched: number;
  failed: number;
}> {
  // Kill switch, like AIRSPACE_DAILY_SNAPSHOTS.
  if (getEnvValueSync(env, "AIRSPACE_AUTHORITY_HISTORY") === "off") {
    return { fetched: 0, failed: 0 };
  }
  const projects = await ProjectRepository.listActiveWithDomain();
  let fetched = 0;
  let failed = 0;
  const now = Date.now();
  for (const project of projects) {
    if (fetched + failed >= MAX_FETCHES_PER_TICK) break;
    if (!project.domain) continue;
    const last = await AuthorityRepository.lastCapturedAt(
      project.id,
      "dataforseo_rank",
    );
    if (last && now - Date.parse(last) < REFRESH_EVERY_DAYS * DAY_MS) continue;
    try {
      await fetchHistory({
        projectId: project.id,
        organizationId: project.organizationId,
        domain: project.domain,
      });
      fetched += 1;
    } catch (error) {
      failed += 1;
      console.error(
        "[cron] authority history refresh failed",
        { projectId: project.id },
        error,
      );
    }
  }
  return { fetched, failed };
}

async function fetchHistory(input: {
  projectId: string;
  organizationId: string;
  domain: string;
}) {
  const dataforseo = createDataforseoClient({
    userId: "system",
    userEmail: "system@openseo.so",
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
  // history/live accepts a hostname only and is always subdomain-inclusive.
  const target = normalizeBacklinksTarget(input.domain, {
    scope: "subdomains",
  }).apiTarget;
  const to = new Date();
  const from = new Date(to.getTime() - HISTORY_DAYS * DAY_MS);
  const items = await dataforseo.backlinks.history({
    target,
    dateFrom: isoDate(from),
    dateTo: isoDate(to),
  });
  const capturedAt = new Date().toISOString();
  const rows = items.flatMap((item) =>
    item.date && typeof item.rank === "number"
      ? [
          {
            projectId: input.projectId,
            domain: input.domain,
            source: "dataforseo_rank" as const,
            date: item.date.slice(0, 10),
            value: item.rank,
            referringDomains: item.referring_domains ?? null,
            capturedAt,
          },
        ]
      : [],
  );
  await AuthorityRepository.upsertPoints(rows);
  return rows.length;
}

/** Ahrefs Domain Rating readings captured in a session, matched to the
 * organization's projects by domain. Unknown domains are returned, not stored. */
async function recordDomainRatings(
  organizationId: string,
  readings: { domain: string; domainRating: number; date: string }[],
): Promise<{ stored: string[]; unmatched: string[] }> {
  const projects = await ProjectRepository.listActiveWithDomain();
  const byHost = new Map(
    projects
      .filter((p) => p.organizationId === organizationId && p.domain)
      .map((p) => [normaliseHost(p.domain ?? ""), p]),
  );
  const stored: string[] = [];
  const unmatched: string[] = [];
  const capturedAt = new Date().toISOString();
  const rows = readings.flatMap((reading) => {
    const project = byHost.get(normaliseHost(reading.domain));
    if (!project?.domain) {
      unmatched.push(reading.domain);
      return [];
    }
    stored.push(project.domain);
    return [
      {
        projectId: project.id,
        domain: project.domain,
        source: "ahrefs_dr" as const,
        date: reading.date.slice(0, 10),
        value: reading.domainRating,
        referringDomains: null,
        capturedAt,
      },
    ];
  });
  await AuthorityRepository.upsertPoints(rows);
  return { stored, unmatched };
}

function normaliseHost(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

async function getAuthority(
  projectId: string,
  domain: string | null,
): Promise<AuthoritySummary> {
  const points = await AuthorityRepository.listForProject(projectId, domain);
  return summarizeAuthority(points);
}

export const AuthorityService = {
  refreshDueHistories,
  fetchHistory,
  recordDomainRatings,
  getAuthority,
};
