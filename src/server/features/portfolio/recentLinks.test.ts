import { describe, expect, it } from "vitest";
import { selectNewCleanLinks } from "@/server/features/portfolio/recentLinks";
import { CLEAN_LINK_MAX_SPAM_SCORE } from "@/shared/backlinkQuality";

const now = new Date("2026-09-02T12:00:00Z");

function link(
  overrides: Partial<Parameters<typeof selectNewCleanLinks>[0][number]>,
) {
  return {
    domainFrom: "example.org",
    urlFrom: "https://example.org/post",
    urlTo: "https://boltjobs.com/",
    anchor: "Bolt Jobs",
    spamScore: 5,
    rank: 120,
    isDofollow: true,
    firstSeen: "2026-08-30 10:00:00 +00:00",
    ...overrides,
  };
}

describe("selectNewCleanLinks", () => {
  it("keeps clean links inside the window and drops spam, stale and malformed rows", () => {
    const result = selectNewCleanLinks(
      [
        link({
          domainFrom: "fresh.org",
          firstSeen: "2026-09-01 08:00:00 +00:00",
        }),
        link({
          domainFrom: "older.org",
          firstSeen: "2026-08-20 08:00:00 +00:00",
        }),
        link({
          domainFrom: "spam.biz",
          spamScore: CLEAN_LINK_MAX_SPAM_SCORE + 1,
        }),
        link({ domainFrom: "edge.org", spamScore: CLEAN_LINK_MAX_SPAM_SCORE }),
        link({
          domainFrom: "stale.org",
          firstSeen: "2026-07-01 08:00:00 +00:00",
        }),
        link({ domainFrom: "unscored.org", spamScore: null }),
        link({ domainFrom: null }),
        link({ domainFrom: "nodate.org", firstSeen: null }),
      ],
      now,
    );
    // Newest first; the spam-score boundary is inclusive.
    expect(result.map((row) => row.domainFrom)).toEqual([
      "fresh.org",
      "edge.org",
      "older.org",
    ]);
  });

  it("returns an empty list when nothing is new", () => {
    expect(
      selectNewCleanLinks(
        [link({ firstSeen: "2026-01-01 00:00:00 +00:00" })],
        now,
      ),
    ).toEqual([]);
  });
});
