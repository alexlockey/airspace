import type { AuditIssueType } from "@/shared/audit-issues";
import type { SiteType } from "@/types/schemas/projects";

// Airspace fork: the single source of truth for site-type audit
// reinterpretation (the job-board/directory paradigm). Keyed by the REAL
// audit issue-type registry so an upstream key rename is a type error here,
// not a silently dead rule. Rationale lives in the OS repo's Chukovski
// rubric: on a job board, expired-listing churn makes broken links/pages
// inventory lifecycle rather than decay, and backfilled inventory makes
// duplicate/thin content expected; directories share only the duplication
// forgiveness.
export const SITE_TYPE_NEUTRAL_ISSUES: Record<
  SiteType,
  readonly AuditIssueType[]
> = {
  standard: [],
  job_board: [
    "broken-internal-link",
    "broken-page",
    "duplicate-content",
    "thin-content",
  ],
  directory: ["duplicate-content"],
};

export function isIssueNeutralForSiteType(
  issueType: string,
  siteType: SiteType,
): boolean {
  return (SITE_TYPE_NEUTRAL_ISSUES[siteType] as readonly string[]).includes(
    issueType,
  );
}
