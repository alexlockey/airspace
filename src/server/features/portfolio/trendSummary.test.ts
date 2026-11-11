import { describe, expect, it } from "vitest";
import { summarizeAuthority } from "./authoritySummary";
import { buildTrendSummary, pageMovers } from "./trendSummary";

const noAuthority = { ahrefsDr: null, dataforseoRank: null };

describe("buildTrendSummary", () => {
  it("calls a 10%+ click rise up and names the movers", () => {
    const summary = buildTrendSummary({
      gsc: {
        connected: true,
        clicks: 1540,
        prevClicks: 1300,
        impressions: 100_000,
        prevImpressions: 95_000,
        gained: { page: "https://x.co.uk/standards/a", clicks: 200, delta: 140 },
        lost: { page: "https://x.co.uk/blog/b", clicks: 10, delta: -40 },
      },
      authority: noAuthority,
      newCleanLinks: 3,
      topAction: "Rewrite the title on /blog/b",
    });
    expect(summary.direction).toBe("up");
    expect(summary.headline).toBe("Clicks up 18%");
    expect(summary.state).toContain("1,300 to 1,540");
    expect(summary.driver).toContain("/standards/a (+140 clicks)");
    expect(summary.driver).toContain("/blog/b (-40)");
    expect(summary.driver).toContain("3 new clean links");
    expect(summary.todo).toBe("Do next: Rewrite the title on /blog/b");
  });

  it("treats small moves as steady and falls back to impressions on tiny sites", () => {
    const steady = buildTrendSummary({
      gsc: {
        connected: true,
        clicks: 105,
        prevClicks: 100,
        impressions: 1000,
        prevImpressions: 1000,
        gained: null,
        lost: null,
      },
      authority: noAuthority,
      newCleanLinks: 0,
      topAction: null,
    });
    expect(steady.direction).toBe("steady");
    const tiny = buildTrendSummary({
      gsc: {
        connected: true,
        clicks: 6,
        prevClicks: 3,
        impressions: 400,
        prevImpressions: 1000,
        gained: null,
        lost: null,
      },
      authority: noAuthority,
      newCleanLinks: 0,
      topAction: null,
    });
    expect(tiny.direction).toBe("down");
    expect(tiny.headline).toBe("Impressions down 60%");
  });

  it("prefers Ahrefs DR over the DataForSEO rank and reads it over the longest range", () => {
    const authority = summarizeAuthority([
      { source: "ahrefs_dr", date: "2026-08-13", value: 5, referringDomains: null },
      { source: "ahrefs_dr", date: "2026-09-10", value: 6, referringDomains: null },
      { source: "ahrefs_dr", date: "2026-11-11", value: 11, referringDomains: null },
      { source: "dataforseo_rank", date: "2026-10-01", value: 9, referringDomains: 50 },
    ]);
    expect(authority.ahrefsDr?.change12m).toBe(6);
    const summary = buildTrendSummary({
      gsc: { connected: false },
      authority,
      newCleanLinks: 0,
      topAction: null,
    });
    expect(summary.direction).toBe("nodata");
    expect(summary.driver).toBe("Domain Rating 5 to 11 since 13 Aug.");
  });
});

describe("page labels", () => {
  it("names a page on another host instead of calling both the home page", () => {
    const summary = buildTrendSummary({
      domain: "grantsbakery.co.uk",
      gsc: {
        connected: true,
        clicks: 2452,
        prevClicks: 2599,
        impressions: 10,
        prevImpressions: 10,
        gained: { page: "https://www.grantsbakery.co.uk/", clicks: 900, delta: 38 },
        lost: { page: "https://shop.grantsbakery.co.uk/", clicks: 100, delta: -71 },
      },
      authority: noAuthority,
      newCleanLinks: 0,
      topAction: null,
    });
    expect(summary.driver).toContain("Biggest gain the home page (+38 clicks)");
    expect(summary.driver).toContain("biggest drop shop.grantsbakery.co.uk home page (-71)");
  });
});

describe("pageMovers", () => {
  it("sums job-board adverts per section", () => {
    const movers = pageMovers(
      [
        { page: "https://b.com/jobs/1-a", clicks: 10 },
        { page: "https://b.com/jobs/2-b", clicks: 5 },
        { page: "https://b.com/blog/x", clicks: 50 },
      ],
      [
        { page: "https://b.com/jobs/1-a", clicks: 400 },
        { page: "https://b.com/jobs/3-c", clicks: 100 },
        { page: "https://b.com/blog/x", clicks: 40 },
      ],
      { bySection: true },
    );
    expect(movers.lost).toEqual({ page: "https://b.com/jobs/", clicks: 15, delta: -485, section: true });
    expect(movers.gained?.page).toBe("https://b.com/blog/");
  });

  it("folds jump links into their page and picks the top gain and drop", () => {
    const movers = pageMovers(
      [
        { page: "https://x.co/a", clicks: 50 },
        { page: "https://x.co/a#faq", clicks: 10 },
        { page: "https://x.co/b", clicks: 5 },
      ],
      [
        { page: "https://x.co/a", clicks: 20 },
        { page: "https://x.co/b", clicks: 30 },
      ],
    );
    expect(movers.gained).toEqual({ page: "https://x.co/a", clicks: 60, delta: 40 });
    expect(movers.lost).toEqual({ page: "https://x.co/b", clicks: 5, delta: -25 });
  });
});
