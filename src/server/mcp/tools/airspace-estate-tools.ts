import { PortfolioCacheService } from "@/server/features/portfolio/PortfolioCacheService";
import { z } from "zod";
import type { PortfolioService } from "@/server/features/portfolio/PortfolioService";
import { AuthorityService } from "@/server/features/portfolio/AuthorityService";
import { ServiceAccountBindingService } from "@/server/features/google/ServiceAccountBindingService";
import { mcpResponse } from "@/server/mcp/formatters";
import { type ToolContext } from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { buildDashboardUrl } from "@/server/mcp/urls";

// Airspace fork: estate-level MCP tools. get_portfolio is the free, stored-data
// read the Airspace Weekly runner and any session use for "how are my sites
// doing"; bind_google_service_account re-runs the service-account binding.

type PortfolioRows = Awaited<ReturnType<typeof PortfolioService.getPortfolio>>;
type AuthorityRow = PortfolioRows[number]["authority"];

function pickSeries(series: AuthorityRow["ahrefsDr"]) {
  return series
      ? {
          latest: series.latest,
          latestDate: series.latestDate,
          change3m: series.change3m,
          change3mFrom: series.change3mFrom,
          change12m: series.change12m,
          change12mFrom: series.change12mFrom,
          series: series.series,
        }
    : null;
}

function compactAuthority(authority: AuthorityRow) {
  return {
    ahrefsDomainRating: pickSeries(authority.ahrefsDr),
    dataforseoRank: pickSeries(authority.dataforseoRank),
  };
}
type PortfolioRow = PortfolioRows[number];

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function compactRow(row: PortfolioRow, baseUrl: string) {
  const gsc = row.gsc.connected
    ? {
        connected: true,
        clicks28d: row.gsc.totals.clicks,
        clicksPrev28d: row.gsc.prevTotals.clicks,
        clicksChangePct: pctChange(
          row.gsc.totals.clicks,
          row.gsc.prevTotals.clicks,
        ),
        impressions28d: row.gsc.totals.impressions,
        impressionsPrev28d: row.gsc.prevTotals.impressions,
        ctr28d: row.gsc.totals.ctr,
        position28d: row.gsc.totals.position,
        dailyClicks: row.gsc.daily.map((d) => d.clicks),
        topGainingPage: row.gsc.gained,
        topLosingPage: row.gsc.lost,
      }
    : { connected: false, errored: Boolean(row.gsc.errored) };
  return {
    projectId: row.project.id,
    name: row.project.name,
    domain: row.project.domain,
    siteType: row.project.siteType,
    severity: row.severity,
    health: row.health,
    loadError: row.loadError,
    gsc,
    backlinks: row.backlinks
      ? {
          rank: row.backlinks.rank,
          referringDomains: row.backlinks.referringDomains,
          backlinks: row.backlinks.backlinks,
          newReferringDomains: row.backlinks.newReferringDomains,
          lostReferringDomains: row.backlinks.lostReferringDomains,
          capturedAt: row.backlinks.capturedAt,
        }
      : null,
    newCleanLinks: {
      tracked: row.newLinks.tracked,
      count: row.newLinks.cleanCount,
      shown: row.newLinks.shown.map((l) => ({
        domainFrom: l.domainFrom,
        urlFrom: l.urlFrom,
        urlTo: l.urlTo,
        spamScore: l.spamScore,
        firstSeen: l.firstSeen,
      })),
    },
    rankTracking: row.rank,
    audit: row.audit
      ? {
          status: row.audit.status,
          pagesCrawled: row.audit.pagesCrawled,
          startedAt: row.audit.startedAt,
          topIssues: row.audit.topIssues,
          totalIssueTypes: row.audit.totalIssueTypes,
        }
      : null,
    recommendations: row.recommendations,
    trend: row.trend,
    authority: compactAuthority(row.authority),
    url: buildDashboardUrl(baseUrl, `/p/${row.project.id}`),
  };
}

function changeText(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return "";
  return ` (${pct > 0 ? "+" : ""}${pct}%)`;
}

function summaryLine(row: ReturnType<typeof compactRow>): string {
  const gsc = row.gsc.connected
    ? `clicks 28d ${row.gsc.clicks28d}${changeText(row.gsc.clicksChangePct)}`
    : row.gsc.errored
      ? "GSC error"
      : "GSC not connected";
  const links = row.newCleanLinks.count
    ? `, +${row.newCleanLinks.count} new clean links`
    : "";
  const next = row.recommendations[0]?.title ?? "nothing flagged";
  return `- ${row.name} (${row.domain ?? "no domain"}): ${row.severity}, health ${row.health ?? "-"}, ${gsc}${links}. ${row.trend.driver} Next: ${next}`;
}

export const getPortfolioTool = {
  name: "get_portfolio",
  config: {
    title: "Estate portfolio overview",
    description:
      "Every project in one call: a plain three-line trend summary (direction, driver, next step), severity, health score, Search Console clicks and impressions (last 28 days vs the previous 28, daily series, top gaining and losing page), authority over time (Ahrefs Domain Rating points and DataForSEO monthly domain rank), backlink snapshot, new clean backlinks, rank-tracking movement, latest audit and recommended actions. Served from a copy recomputed hourly; pass fresh=true to recompute now (about 15 seconds). Uses no credits. Use this first for 'how are my sites doing' or any estate-wide question.",
    inputSchema: {
      fresh: z
        .boolean()
        .optional()
        .describe("Recompute now instead of using the hourly copy."),
    },
    outputSchema: z.looseObject({
      sites: z.array(z.looseObject({ projectId: z.string() })),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: async (args: { fresh?: boolean }, context: ToolContext) => {
    const { baseUrl, organizationId } = context.auth;
    const portfolio = await PortfolioCacheService.getPortfolioCached(
      organizationId,
      { force: args.fresh === true },
    );
    const sites = portfolio.rows.map((row) => compactRow(row, baseUrl));
    return mcpResponse({
      text: `Estate (${sites.length} sites, computed ${portfolio.computedAt}):\n${sites.map(summaryLine).join("\n")}`,
      meta: { url: buildDashboardUrl(baseUrl, "/portfolio") },
      structuredContent: { sites, computedAt: portfolio.computedAt },
    });
  },
};

export const bindGoogleServiceAccountTool = {
  name: "bind_google_service_account",
  config: {
    title: "Bind Google service account",
    description:
      "Connects every project to the Search Console site and Google Analytics property the configured service account can see, matched by domain. Runs automatically every six hours; call it after granting the service account access to a new property. Uses no credits.",
    inputSchema: {} as Record<string, never>,
    outputSchema: z.looseObject({
      configured: z.boolean(),
      serviceAccountEmail: z.string().nullable(),
      gsc: z.looseObject({}),
      ga4: z.looseObject({}),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: async () => {
    const report = await ServiceAccountBindingService.bindAll();
    const lines = report.configured
      ? [
          `Service account: ${report.serviceAccountEmail}`,
          `Search Console bound: ${report.gsc.bound.map((b) => `${b.project} -> ${b.siteUrl}`).join("; ") || "none"}`,
          `Search Console not visible to the service account: ${report.gsc.unmatched.join(", ") || "none"}`,
          report.gsc.error ? `Search Console error: ${report.gsc.error}` : "",
          `GA4 bound: ${report.ga4.bound.map((b) => `${b.project} -> ${b.propertyId}`).join("; ") || "none"}`,
          `GA4 not visible to the service account: ${report.ga4.unmatched.join(", ") || "none"}`,
          report.ga4.error ? `GA4 error: ${report.ga4.error}` : "",
        ].filter(Boolean)
      : ["No service account configured (AIRSPACE_GOOGLE_SA_JSON_B64)."];
    return mcpResponse({ text: lines.join("\n"), structuredContent: report });
  },
};

export const recordDomainRatingsTool = {
  name: "record_domain_ratings",
  config: {
    title: "Record Ahrefs Domain Rating readings",
    description:
      "Stores Ahrefs Domain Rating readings (for example from Ahrefs' free domain-rating lookup) against the matching projects, so the portfolio shows Domain Rating and its change over time. One reading per domain per date; a repeat for the same date replaces it. Domains with no project are returned as unmatched. Uses no credits.",
    inputSchema: {
      readings: z
        .array(
          z.object({
            domain: z.string().min(1),
            domainRating: z.number().min(0).max(100),
            date: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .describe("YYYY-MM-DD the reading was taken."),
          }),
        )
        .min(1)
        .max(100),
    },
    outputSchema: z.looseObject({
      stored: z.array(z.string()),
      unmatched: z.array(z.string()),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: async (
    args: {
      readings: { domain: string; domainRating: number; date: string }[];
    },
    context: ToolContext,
  ) => {
    const result = await AuthorityService.recordDomainRatings(
      context.auth.organizationId,
      args.readings,
    );
    // The portfolio copy should show the new points straight away.
    await PortfolioCacheService.invalidate(context.auth.organizationId);
    return mcpResponse({
      text: `Stored ${result.stored.length} reading(s): ${result.stored.join(", ") || "none"}. Unmatched: ${result.unmatched.join(", ") || "none"}.`,
      structuredContent: result,
    });
  },
};
