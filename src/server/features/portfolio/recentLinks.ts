import {
  CLEAN_LINK_MAX_SPAM_SCORE,
  NEW_LINK_WINDOW_DAYS,
} from "@/shared/backlinkQuality";

// Airspace fork: pure selection of "new clean links" from the stored recent
// links, so the rule is unit-testable and shared by the portfolio and any
// digest job.

export type RecentLinkInput = {
  domainFrom: string | null;
  urlFrom: string | null;
  urlTo: string | null;
  anchor: string | null;
  spamScore: number | null;
  rank: number | null;
  isDofollow: boolean | null;
  firstSeen: string | null;
};

export type NewCleanLink = RecentLinkInput & {
  domainFrom: string;
  urlFrom: string;
  firstSeen: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function isNewCleanLink(
  link: RecentLinkInput,
  cutoffMs: number,
): link is NewCleanLink {
  if (!link.domainFrom || !link.urlFrom || !link.firstSeen) return false;
  // Unknown spam score is not "clean": the provider scores every link it
  // returns, so null means the row is malformed rather than safe.
  if (link.spamScore === null || link.spamScore > CLEAN_LINK_MAX_SPAM_SCORE) {
    return false;
  }
  const seenMs = Date.parse(link.firstSeen);
  return !Number.isNaN(seenMs) && seenMs >= cutoffMs;
}

/** Newest first, clean only, inside the new-link window. */
export function selectNewCleanLinks(
  links: RecentLinkInput[],
  now: Date = new Date(),
): NewCleanLink[] {
  const cutoffMs = now.getTime() - NEW_LINK_WINDOW_DAYS * DAY_MS;
  return links
    .filter((link) => isNewCleanLink(link, cutoffMs))
    .toSorted((a, z) => Date.parse(z.firstSeen) - Date.parse(a.firstSeen));
}
