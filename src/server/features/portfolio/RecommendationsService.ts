import type {
  DashboardAuditSummary,
  DashboardBacklinkSummary,
  DashboardRankSummary,
} from "@/server/features/dashboard/services/DashboardService";
import { isIssueNeutralForSiteType } from "@/shared/siteTypeRules";
import type { SiteType } from "@/types/schemas/projects";

// Airspace fork: rule-based recommended actions. Every recommendation is
// derived from stored evidence and says why; the LLM layer lives in the OS
// skills, not here, so this stays deterministic and free.

// Tuning surface in one place so presets, copy and rules cannot drift apart.
export const SPAM_LINK_MIN_BACKLINKS = 5000;
export const SPAM_LINK_RATIO = 100;
const MAX_RECOMMENDATIONS = 6;

export type Recommendation = {
  // 1 = act now, 2 = review, 3 = setup/housekeeping
  priority: 1 | 2 | 3;
  category:
    | "technical"
    | "links"
    | "keywords"
    | "content"
    | "setup"
    | "opportunity";
  title: string;
  evidence: string;
  // In-app destination, project-relative route segment (see the dashboard
  // card's link switch). Null lands on the project dashboard.
  target: "audit" | "backlinks" | "rank-tracking" | "search-performance" | null;
};

export type PortfolioSeverity = "critical" | "warn" | "nodata" | "good";

export function buildRecommendations(input: {
  siteType: SiteType;
  rank: DashboardRankSummary | null;
  audit: DashboardAuditSummary | null;
  backlinks: DashboardBacklinkSummary | null;
  gscConnected: boolean;
  strikingDistance?: {
    query: string;
    page: string;
    position: number;
    impressions: number;
  }[];
}): Recommendation[] {
  const recs: Recommendation[] = [];
  const issues = (input.audit?.topIssues ?? []).filter(
    (issue) => !isIssueNeutralForSiteType(issue.issueType, input.siteType),
  );

  for (const issue of issues) {
    if (issue.severity === "critical") {
      recs.push({
        priority: 1,
        category: "technical",
        title: `Fix ${formatIssueType(issue.issueType)} (${issue.count} pages)`,
        evidence: `Latest audit found ${issue.count} pages with ${formatIssueType(issue.issueType)}, severity critical.`,
        target: "audit",
      });
    } else if (issue.severity === "warning") {
      recs.push({
        priority: 2,
        category: "technical",
        title: `Review ${formatIssueType(issue.issueType)} (${issue.count} pages)`,
        evidence: `Latest audit: ${issue.count} pages, severity warning.`,
        target: "audit",
      });
    }
  }

  const b = input.backlinks;
  if (
    b?.backlinks != null &&
    b.referringDomains != null &&
    b.referringDomains > 0 &&
    b.backlinks > SPAM_LINK_MIN_BACKLINKS &&
    b.backlinks / b.referringDomains > SPAM_LINK_RATIO
  ) {
    recs.push({
      priority: 1,
      category: "links",
      title: "Review spam links and prepare a disavow",
      evidence: `${b.backlinks.toLocaleString()} backlinks from only ${b.referringDomains.toLocaleString()} referring domains is a sitewide spam pattern. Use Spam review, then the Disavow file button.`,
      target: "backlinks",
    });
  }
  if (
    b &&
    (b.lostReferringDomains ?? 0) > (b.newReferringDomains ?? 0) &&
    (b.lostReferringDomains ?? 0) > 0
  ) {
    recs.push({
      priority: 2,
      category: "links",
      title: "Investigate lost referring domains",
      evidence: `Net loss this period: -${b.lostReferringDomains} vs +${b.newReferringDomains ?? 0} referring domains.`,
      target: "backlinks",
    });
  }

  if (input.rank && input.rank.declined > input.rank.improved) {
    recs.push({
      priority: 2,
      category: "keywords",
      title: `Review declining rankings (${input.rank.declined} down, ${input.rank.improved} up)`,
      evidence: "More tracked keywords declined than improved over 7 days.",
      target: "rank-tracking",
    });
  }

  for (const row of (input.strikingDistance ?? []).slice(0, 3)) {
    recs.push({
      priority: 2,
      category: "opportunity",
      title: `Push "${row.query}" from position ${Math.round(row.position)}`,
      evidence: `${row.impressions.toLocaleString()} impressions in striking distance (positions 5-20) for ${row.page}. Small on-page and internal-linking gains move real traffic here.`,
      target: "search-performance",
    });
  }

  // Setup gaps last: real, but never above data-driven findings.
  if (!input.audit) {
    recs.push({
      priority: 3,
      category: "setup",
      title: "Run a site audit",
      evidence: "No audit has run yet, so technical issues are invisible.",
      target: "audit",
    });
  }
  if (!input.gscConnected) {
    recs.push({
      priority: 3,
      category: "setup",
      title: "Connect Search Console",
      evidence: "Without GSC the dashboard runs on estimates only.",
      target: null,
    });
  }
  if (!input.rank || input.rank.trackedKeywords === 0) {
    recs.push({
      priority: 3,
      category: "setup",
      title: "Add tracked keywords",
      evidence: "No keywords tracked, so movement is invisible.",
      target: "rank-tracking",
    });
  }

  return recs
    .toSorted((a, z) => a.priority - z.priority)
    .slice(0, MAX_RECOMMENDATIONS);
}

/** One severity per site, derived from the recommendations so chips, sort
 * order and action lists can never disagree — computed server-side so digest
 * jobs and MCP tools share the same answer as the UI. */
export function severityFromRecommendations(
  recommendations: Recommendation[],
  hasAnyData: boolean,
): PortfolioSeverity {
  const top = recommendations[0];
  if (top?.priority === 1) return "critical";
  if (top?.priority === 2) return "warn";
  if (!hasAnyData) return "nodata";
  return "good";
}

function formatIssueType(issueType: string) {
  return issueType.replaceAll(/[_-]/g, " ");
}
