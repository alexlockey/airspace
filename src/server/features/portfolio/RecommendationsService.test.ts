import { describe, expect, it } from "vitest";
import {
  buildRecommendations,
  severityFromRecommendations,
} from "@/server/features/portfolio/RecommendationsService";

const baseInput = {
  siteType: "standard" as const,
  rank: null,
  audit: null,
  backlinks: null,
  gscConnected: false,
};

function auditWith(
  issues: {
    issueType: string;
    severity: "critical" | "warning" | "info";
    count: number;
  }[],
) {
  return {
    status: "completed" as const,
    pagesCrawled: 100,
    startedAt: "2026-09-01T00:00:00Z",
    topIssues: issues,
    totalIssueTypes: issues.length,
  };
}

describe("buildRecommendations", () => {
  it("flags the sitewide spam-link pattern as priority 1", () => {
    const recs = buildRecommendations({
      ...baseInput,
      backlinks: {
        domain: "example.com",
        rank: 60,
        backlinks: 40000,
        referringDomains: 48,
        newBacklinks: null,
        lostBacklinks: null,
        newReferringDomains: null,
        lostReferringDomains: null,
        capturedAt: "2026-09-01T00:00:00Z",
        stale: false,
      },
    });
    expect(recs[0]).toMatchObject({ priority: 1, category: "links" });
  });

  it("neutralises job-board inventory-churn issue types using REAL registry keys", () => {
    const audit = auditWith([
      { issueType: "broken-internal-link", severity: "critical", count: 400 },
      { issueType: "broken-page", severity: "warning", count: 90 },
      { issueType: "missing-title", severity: "critical", count: 5 },
    ]);
    const standard = buildRecommendations({ ...baseInput, audit });
    const jobBoard = buildRecommendations({
      ...baseInput,
      siteType: "job_board",
      audit,
    });
    expect(standard.filter((rec) => rec.category === "technical")).toHaveLength(
      3,
    );
    // Only the non-churn issue survives on a job board.
    const technical = jobBoard.filter((rec) => rec.category === "technical");
    expect(technical).toHaveLength(1);
    expect(technical[0]?.title).toContain("missing title");
  });

  it("keeps priority-1 findings ahead of setup recommendations and within the cap", () => {
    const recs = buildRecommendations({
      ...baseInput,
      audit: auditWith([
        { issueType: "server-error", severity: "critical", count: 10 },
        { issueType: "missing-title", severity: "critical", count: 3 },
        { issueType: "duplicate-title", severity: "warning", count: 7 },
      ]),
    });
    expect(recs.length).toBeLessThanOrEqual(6);
    expect(recs[0]?.priority).toBe(1);
    const priorities = recs.map((rec) => rec.priority);
    expect(priorities.toSorted((a, z) => a - z)).toEqual(priorities);
  });
});

describe("severityFromRecommendations", () => {
  it("maps top priority to the chip severity and empty data to nodata", () => {
    expect(
      severityFromRecommendations(
        [
          {
            priority: 1,
            category: "links",
            title: "x",
            evidence: "y",
            target: null,
          },
        ],
        true,
      ),
    ).toBe("critical");
    expect(severityFromRecommendations([], false)).toBe("nodata");
    expect(severityFromRecommendations([], true)).toBe("good");
  });
});
