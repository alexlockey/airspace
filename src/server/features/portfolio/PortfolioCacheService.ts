import { sort } from "remeda";
import { PortfolioCacheRepository } from "@/server/features/portfolio/PortfolioCacheRepository";
import {
  PortfolioService,
  type PortfolioRowData,
} from "@/server/features/portfolio/PortfolioService";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { ProjectService } from "@/server/features/projects/services/ProjectService";

// Airspace fork: the portfolio fans two to four Search Console calls per site,
// about 15 seconds for the estate, so the page reads a stored copy instead.

// The page serves the stored copy while it is younger than this; the
// scheduler re-computes it every PORTFOLIO_REFRESH_MS so a visit rarely waits.
const PORTFOLIO_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const PORTFOLIO_REFRESH_MS = 60 * 60 * 1000;

/** What the stored copy was computed for. A project archived, restored,
 * deleted, renamed or moved to a new domain changes it, so the copy is
 * recomputed instead of showing a site that is gone (no upstream edits). */
function projectsFingerprint(
  projects: { id: string; name: string; domain: string | null; siteType: string }[],
) {
  return sort(
    projects.map((p) => `${p.id}|${p.name}|${p.domain ?? ""}|${p.siteType}`),
    (a, z) => a.localeCompare(z),
  ).join("\n");
}

function rowsFingerprint(rows: PortfolioRowData[]) {
  return projectsFingerprint(rows.map((row) => row.project));
}

export type CachedPortfolio = {
  rows: PortfolioRowData[];
  computedAt: string;
  fromCache: boolean;
};

async function computeAndStore(organizationId: string): Promise<CachedPortfolio> {
  const rows = await PortfolioService.getPortfolio(organizationId);
  const computedAt = new Date().toISOString();
  // A copy with a failed site is still worth serving, but never stored as the
  // "fresh" copy for six hours: the next scheduler tick retries it.
  const storedAt = rows.some((row) => row.loadError)
    ? new Date(Date.now() - PORTFOLIO_MAX_AGE_MS).toISOString()
    : computedAt;
  await PortfolioCacheRepository.put(
    organizationId,
    JSON.stringify(rows),
    storedAt,
  );
  return { rows, computedAt, fromCache: false };
}

/** The portfolio from the stored copy when it is fresh enough, otherwise
 * computed now and stored. `force` always recomputes (the Refresh button). */
async function getPortfolioCached(
  organizationId: string,
  options: { force?: boolean } = {},
): Promise<CachedPortfolio> {
  if (!options.force) {
    const cached = await PortfolioCacheRepository.get(organizationId);
    if (
      cached &&
      Date.now() - Date.parse(cached.computedAt) < PORTFOLIO_MAX_AGE_MS
    ) {
      try {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- payload is our own serialised getPortfolio output
        const rows = JSON.parse(cached.payload) as PortfolioRowData[];
        const current = await ProjectService.listProjects(organizationId);
        if (rowsFingerprint(rows) === projectsFingerprint(current)) {
          return { rows, computedAt: cached.computedAt, fromCache: true };
        }
      } catch {
        // A corrupt copy falls through to a recompute.
      }
    }
  }
  return computeAndStore(organizationId);
}

/** Scheduler: keep every organization's stored portfolio under an hour old. */
async function refreshPortfolioCaches(): Promise<{ refreshed: number }> {
  const projects = await ProjectRepository.listActiveWithDomain();
  const organizations = [...new Set(projects.map((p) => p.organizationId))];
  let refreshed = 0;
  for (const organizationId of organizations) {
    const cached = await PortfolioCacheRepository.get(organizationId);
    if (
      cached &&
      Date.now() - Date.parse(cached.computedAt) < PORTFOLIO_REFRESH_MS
    ) {
      continue;
    }
    await computeAndStore(organizationId);
    refreshed += 1;
  }
  return { refreshed };
}

/** Drop the stored copy after a change that reshapes it (site type). */
async function invalidate(organizationId: string) {
  await PortfolioCacheRepository.clear(organizationId);
}

export const PortfolioCacheService = {
  getPortfolioCached,
  refreshPortfolioCaches,
  invalidate,
};
