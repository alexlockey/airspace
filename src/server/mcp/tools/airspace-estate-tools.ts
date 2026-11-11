import { z } from "zod";
import { PortfolioService } from "@/server/features/portfolio/PortfolioService";
import { ServiceAccountBindingService } from "@/server/features/google/ServiceAccountBindingService";
import { mcpResponse } from "@/server/mcp/formatters";
import { type ToolContext } from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { buildDashboardUrl } from "@/server/mcp/urls";

// Airspace fork: estate-level MCP tools. get_portfolio is the free, stored-data
// read the Airspace Weekly runner and any session use for "how are my sites
// doing"; bind_google_service_account re-runs the service-account binding.

type PortfolioRows = Awaited<ReturnType<typeof PortfolioService.getPortfolio>>;
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
  return `- ${row.name} (${row.domain ?? "no domain"}): ${row.severity}, health ${row.health ?? "-"}, ${gsc}${links}. Next: ${next}`;
}

export const getPortfolioTool = {
  name: "get_portfolio",
  config: {
    title: "Estate portfolio overview",
    description:
      "Every project in one call: severity, health score, Search Console clicks and impressions (last 28 days vs the previous 28, daily series), backlink snapshot, new clean backlinks, rank-tracking movement, latest audit and recommended actions. Reads stored data and first-party Search Console only. Uses no credits. Use this first for 'how are my sites doing' or any estate-wide question.",
    inputSchema: {} as Record<string, never>,
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
  handler: async (_args: Record<string, never>, context: ToolContext) => {
    const { baseUrl, organizationId } = context.auth;
    const rows = await PortfolioService.getPortfolio(organizationId);
    const sites = rows.map((row) => compactRow(row, baseUrl));
    return mcpResponse({
      text: `Estate (${sites.length} sites):\n${sites.map(summaryLine).join("\n")}`,
      meta: { url: buildDashboardUrl(baseUrl, "/portfolio") },
      structuredContent: { sites },
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
