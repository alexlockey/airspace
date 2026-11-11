import type { BillingCustomerContext } from "@/server/billing/subscription";
import { BacklinkRecentLinkRepository } from "@/server/features/dashboard/repositories/BacklinkRecentLinkRepository";
import { BacklinkSnapshotRepository } from "@/server/features/dashboard/repositories/BacklinkSnapshotRepository";
import { mapBacklinksRows } from "@/server/features/backlinks/services/backlinksRowMappers";
import {
  DashboardService,
  type DashboardAuditSummary,
} from "@/server/features/dashboard/services/DashboardService";
import { RECENT_LINKS_STORED } from "@/shared/backlinkQuality";
import { getIssueTypePageCountsForAudit } from "@/server/features/audit/repositories/auditSummaryQueries";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { getLatestResults } from "@/server/features/rank-tracking/services/rankTrackingResults";
import {
  createDataforseoClient,
  normalizeBacklinksTarget,
} from "@/server/lib/dataforseo";

// Airspace fork (Nov 2026 upstream sync): upstream #872 rebuilt the project
// dashboard as a monitoring home and dropped the stored backlink snapshot and
// rank summary from DashboardService. The Portfolio, its recommendations and
// the new-clean-links flag still read them, so they live here, fork-owned,
// with upstream's audit summary composed in. The backlink_snapshots table is
// still in upstream's schema; only the code moved.

// Daily cadence: a snapshot under a day old is never re-bought.
const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Bounds the per-config result reads; projects rarely have more than a couple.
const MAX_CONFIGS_FOR_OVERVIEW = 5;

export type DashboardRankSummary = {
  trackedKeywords: number;
  improved: number;
  declined: number;
  top10: number;
  lastCheckedAt: string | null;
};


export type DashboardBacklinkSummary = {
  domain: string;
  rank: number | null;
  backlinks: number | null;
  referringDomains: number | null;
  newBacklinks: number | null;
  lostBacklinks: number | null;
  newReferringDomains: number | null;
  lostReferringDomains: number | null;
  capturedAt: string;
  stale: boolean;
};


// Upstream's summary keeps only the top three issue types; the portfolio health
// score also penalises the issue types it does not show.
export type EstateAuditSummary = DashboardAuditSummary & {
  totalIssueTypes: number;
};

export type EstateOverview = {
  rank: DashboardRankSummary | null;
  audit: EstateAuditSummary | null;
  backlinks: DashboardBacklinkSummary | null;
};

async function getOverview(input: {
  projectId: string;
  domain: string | null;
}): Promise<EstateOverview> {
  const [rank, { audit }, backlinks] = await Promise.all([
    getRankSummary(input.projectId),
    DashboardService.getOverview(input),
    getBacklinkSummary(input.projectId, input.domain),
  ]);
  if (!audit) return { rank, audit: null, backlinks };
  const typeRows = await getIssueTypePageCountsForAudit(audit.id);
  return {
    rank,
    audit: { ...audit, totalIssueTypes: typeRows.length },
    backlinks,
  };
}

async function getRankSummary(
  projectId: string,
): Promise<DashboardRankSummary | null> {
  const configs = await RankTrackingRepository.getConfigsForProject(projectId);
  if (configs.length === 0) return null;

  const results = await Promise.all(
    configs
      .slice(0, MAX_CONFIGS_FOR_OVERVIEW)
      .map((config) => getLatestResults(config.id, projectId, "7d")),
  );

  const summary: DashboardRankSummary = {
    trackedKeywords: 0,
    improved: 0,
    declined: 0,
    top10: 0,
    lastCheckedAt: null,
  };

  for (const result of results) {
    summary.trackedKeywords += result.rows.length;
    if (
      result.run?.lastCheckedAt &&
      (!summary.lastCheckedAt ||
        result.run.lastCheckedAt > summary.lastCheckedAt)
    ) {
      summary.lastCheckedAt = result.run.lastCheckedAt;
    }
    for (const row of result.rows) {
      for (const device of ["desktop", "mobile"] as const) {
        const { position, previousPosition } = row[device];
        if (position !== null && position <= 10) summary.top10 += 1;
        if (position === null || previousPosition === null) continue;
        // Lower position number = better ranking.
        if (position < previousPosition) summary.improved += 1;
        else if (position > previousPosition) summary.declined += 1;
      }
    }
  }

  return summary;
}


function isSnapshotFresh(capturedAt: string): boolean {
  const capturedMs = Date.parse(capturedAt);
  if (Number.isNaN(capturedMs)) return false;
  return Date.now() - capturedMs < SNAPSHOT_MAX_AGE_MS;
}

async function getBacklinkSummary(
  projectId: string,
  domain: string | null,
): Promise<DashboardBacklinkSummary | null> {
  if (!domain) return null;
  const snapshot =
    await BacklinkSnapshotRepository.getLatestForProject(projectId);
  if (!snapshot || snapshot.domain !== domain) return null;
  return {
    domain: snapshot.domain,
    rank: snapshot.rank,
    backlinks: snapshot.backlinks,
    referringDomains: snapshot.referringDomains,
    newBacklinks: snapshot.newBacklinks,
    lostBacklinks: snapshot.lostBacklinks,
    newReferringDomains: snapshot.newReferringDomains,
    lostReferringDomains: snapshot.lostReferringDomains,
    capturedAt: snapshot.capturedAt,
    stale: !isSnapshotFresh(snapshot.capturedAt),
  };
}

/**
 * Visit-triggered snapshot refresh. Fetches only the DataForSEO backlinks
 * summary (not the history endpoint the backlinks page also pays for) and is
 * a no-op while the latest snapshot for the current domain is under a day
 * old. Concurrent loads racing the freshness check can each pay a metered
 * call — every call is metered, so the race duplicates customer spend on
 * identical data but never leaks revenue; accepted for now. On a fetch
 * failure with a stale snapshot in hand, the stale snapshot is returned
 * rather than surfacing an error card.
 */
async function ensureBacklinkSnapshot(input: {
  projectId: string;
  domain: string | null;
  billingCustomer: BillingCustomerContext;
}): Promise<DashboardBacklinkSummary | null> {
  const { projectId, domain } = input;
  if (!domain) return null;

  const latest =
    await BacklinkSnapshotRepository.getLatestForProject(projectId);
  const latestMatchesDomain = latest !== null && latest.domain === domain;
  if (latest && latestMatchesDomain && isSnapshotFresh(latest.capturedAt)) {
    return getBacklinkSummary(projectId, domain);
  }

  // Dashboard totals cover the whole site, subdomains included.
  const normalized = normalizeBacklinksTarget(domain, { scope: "subdomains" });
  const dataforseo = createDataforseoClient(input.billingCustomer);

  try {
    const summary = await dataforseo.backlinks.summary({
      target: normalized.apiTarget,
      includeSubdomains: normalized.includeSubdomains,
    });
    await BacklinkSnapshotRepository.insert({
      projectId,
      domain,
      rank: summary.rank ?? null,
      backlinks: summary.backlinks ?? null,
      referringDomains: summary.referring_domains ?? null,
      brokenBacklinks: summary.broken_backlinks ?? null,
      newBacklinks: summary.new_backlinks ?? null,
      lostBacklinks: summary.lost_backlinks ?? null,
      newReferringDomains:
        summary.new_referring_domains ?? summary.new_reffering_domains ?? null,
      lostReferringDomains:
        summary.lost_referring_domains ??
        summary.lost_reffering_domains ??
        null,
      capturedAt: new Date().toISOString(),
    });
    // Airspace fork: the newest links ride along with the daily summary so
    // the portfolio can flag fresh clean links. Failure here must not undo
    // the snapshot we just paid for, so it degrades to a log line.
    await refreshRecentLinks({
      projectId,
      domain,
      apiTarget: normalized.apiTarget,
      includeSubdomains: normalized.includeSubdomains,
      dataforseo,
    });
  } catch (error) {
    if (latestMatchesDomain) {
      console.error("dashboard: backlink snapshot refresh failed", error);
      return getBacklinkSummary(projectId, domain);
    }
    throw error;
  }

  return getBacklinkSummary(projectId, domain);
}

/** Live (not lost) links, newest first, one per referring domain. One
 * metered rows call per snapshot refresh; the rest of the page reads the
 * stored copy. */
async function refreshRecentLinks(input: {
  projectId: string;
  domain: string;
  apiTarget: string;
  includeSubdomains: boolean;
  dataforseo: ReturnType<typeof createDataforseoClient>;
}) {
  try {
    const response = await input.dataforseo.backlinks.rows({
      target: input.apiTarget,
      includeSubdomains: input.includeSubdomains,
      limit: RECENT_LINKS_STORED,
      orderBy: ["first_seen,desc"],
      mode: "one_per_domain",
      // Nested: fetchBacklinksRows appends its default spam condition with
      // "and", which only nests correctly around a condition array.
      filters: [["is_lost", "=", false]],
    });
    const capturedAt = new Date().toISOString();
    await BacklinkRecentLinkRepository.replaceForProject(
      input.projectId,
      mapBacklinksRows(response.items).map((row) => ({
        projectId: input.projectId,
        domain: input.domain,
        domainFrom: row.domainFrom,
        urlFrom: row.urlFrom,
        urlTo: row.urlTo,
        anchor: row.anchor,
        spamScore: row.spamScore,
        rank: row.rank,
        domainFromRank: row.domainFromRank,
        isDofollow: row.isDofollow,
        firstSeen: row.firstSeen,
        capturedAt,
      })),
    );
  } catch (error) {
    console.error(
      "dashboard: recent links refresh failed",
      { projectId: input.projectId },
      error,
    );
  }
}

export const EstateSnapshotService = {
  getOverview,
  ensureBacklinkSnapshot,
};
