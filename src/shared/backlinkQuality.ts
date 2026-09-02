// Airspace fork: one home for the link-quality thresholds so the Backlinks
// presets, the portfolio's "new clean links" flag and any digest agree on
// what "clean" and "new" mean.

/** Inclusive upper bound on DataForSEO backlink spam score for a link to
 * count as clean. The Clean links preset and the disavow tiers sit either
 * side of this line. */
export const CLEAN_LINK_MAX_SPAM_SCORE = 29;

/** A link whose first_seen falls inside this window is "new" on the
 * portfolio. Matches the provider's new/lost reporting period. */
export const NEW_LINK_WINDOW_DAYS = 30;

/** How many most-recent links the daily snapshot stores per project. The
 * portfolio shows the top few; the Backlinks page has the full list. */
export const RECENT_LINKS_STORED = 20;
