import { sort } from "remeda";
import type {
  AuthoritySeriesSummary,
  AuthoritySummary,
} from "@/server/features/portfolio/authoritySummary";

// Airspace fork: three plain lines per site so the state can be read at a
// glance: where it is heading and by how much, what drove it, what to do.
// Deterministic (no model call), so it costs nothing and loads instantly.

export type PageMover = {
  page: string;
  clicks: number;
  delta: number;
  /** True when the mover is a whole section (job boards). */
  section?: boolean;
};

export type TrendInput = {
  /** The project's domain, so pages on another host (shop.) are named. */
  domain?: string | null;
  gsc:
    | {
        connected: true;
        clicks: number;
        prevClicks: number;
        impressions: number;
        prevImpressions: number;
        gained: PageMover | null;
        lost: PageMover | null;
      }
    | { connected: false };
  authority: AuthoritySummary;
  newCleanLinks: number;
  topAction: string | null;
};

export type TrendDirection = "up" | "down" | "steady" | "nodata";

export type TrendSummary = {
  direction: TrendDirection;
  /** "Clicks up 18%" style label for chips and the estate roll-up. */
  headline: string;
  state: string;
  driver: string;
  todo: string;
};

// A move under 10 per cent on 28 days is noise for sites this size.
const MOVE_THRESHOLD_PCT = 10;
// Below this many clicks, compare impressions instead (tiny counts swing).
const MIN_CLICKS_FOR_CLICKS_VERDICT = 30;
const MIN_MOVER_CLICKS = 5;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function shortDate(iso: string) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

function pct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${value.toLocaleString("en-GB")}`;
}

function movement(label: string, change: number | null) {
  if (change === null) return `${label} new this period`;
  if (Math.abs(change) < 1) return `${label} flat`;
  return `${label} ${change > 0 ? "up" : "down"} ${Math.abs(change)}%`;
}

function bareHost(host: string) {
  return host.toLowerCase().replace(/^www\./, "");
}

/** A path on the site's own host, or host plus path on any other host. */
export function shortPage(url: string, domain?: string | null) {
  try {
    const parsed = new URL(url);
    const sameHost =
      !domain || bareHost(parsed.hostname) === bareHost(domain);
    if (parsed.pathname === "/") {
      return sameHost ? "the home page" : `${bareHost(parsed.hostname)} home page`;
    }
    return sameHost
      ? parsed.pathname
      : `${bareHost(parsed.hostname)}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function authorityPhrase(
  label: string,
  series: AuthoritySeriesSummary | null,
  preferLongRange: boolean,
): string | null {
  if (!series) return null;
  const change = preferLongRange
    ? (series.change12m ?? series.change3m)
    : (series.change3m ?? series.change12m);
  const from = preferLongRange
    ? (series.change12mFrom ?? series.change3mFrom)
    : (series.change3mFrom ?? series.change12mFrom);
  if (change === null || from === null) {
    return `${label} ${series.latest}`;
  }
  if (Math.abs(change) < 1) {
    return `${label} steady at ${series.latest} since ${shortDate(from)}`;
  }
  const start = Math.round((series.latest - change) * 10) / 10;
  return `${label} ${start} to ${series.latest} since ${shortDate(from)}`;
}

export function buildTrendSummary(input: TrendInput): TrendSummary {
  const parts: string[] = [];
  let direction: TrendDirection = "nodata";
  let headline = "No Search Console data";
  let state = "No Search Console data for this site yet.";

  if (input.gsc.connected) {
    const g = input.gsc;
    const clicksPct = pct(g.clicks, g.prevClicks);
    const imprPct = pct(g.impressions, g.prevImpressions);
    const useClicks = g.prevClicks >= MIN_CLICKS_FOR_CLICKS_VERDICT;
    const basis = useClicks ? clicksPct : imprPct;
    direction =
      basis === null
        ? g.clicks > 0 || g.impressions > 0
          ? "up"
          : "steady"
        : basis >= MOVE_THRESHOLD_PCT
          ? "up"
          : basis <= -MOVE_THRESHOLD_PCT
            ? "down"
            : "steady";
    headline = useClicks
      ? movement("Clicks", clicksPct)
      : movement("Impressions", imprPct);
    state =
      `${movement("Clicks", clicksPct)} on the previous 28 days ` +
      `(${g.prevClicks.toLocaleString("en-GB")} to ${g.clicks.toLocaleString("en-GB")}); ` +
      `${movement("impressions", imprPct)}.`;
    if (!useClicks) {
      state += " Too few clicks to judge on clicks alone, so the verdict uses impressions.";
    }
    const movers: string[] = [];
    const label = (mover: PageMover) =>
      mover.section
        ? `${shortPage(mover.page, input.domain)} pages`
        : shortPage(mover.page, input.domain);
    if (g.gained && g.gained.delta >= MIN_MOVER_CLICKS) {
      movers.push(
        `biggest gain ${label(g.gained)} (${signed(g.gained.delta)} clicks)`,
      );
    }
    if (g.lost && g.lost.delta <= -MIN_MOVER_CLICKS) {
      movers.push(`biggest drop ${label(g.lost)} (${signed(g.lost.delta)})`);
    }
    if (movers.length > 0) parts.push(movers.join("; "));
  }

  // Ahrefs DR is the familiar number; DataForSEO rank fills in when no DR
  // point exists. DR points are sparse, so they read over the longest range.
  const authority =
    authorityPhrase("Domain Rating", input.authority.ahrefsDr, true) ??
    authorityPhrase("authority rank", input.authority.dataforseoRank, false);
  if (authority) parts.push(authority);
  if (input.newCleanLinks > 0) {
    parts.push(
      `${input.newCleanLinks} new clean link${input.newCleanLinks === 1 ? "" : "s"} in 30 days`,
    );
  }
  const driver =
    parts.length > 0
      ? `${parts[0]?.charAt(0).toUpperCase()}${parts.join(". ").slice(1)}.`
      : "No page movement, authority or new-link data yet.";

  const todo = input.topAction
    ? `Do next: ${input.topAction}`
    : direction === "down"
      ? "Do next: open Search Performance and find which queries fell."
      : "Nothing urgent.";

  return { direction, headline, state, driver, todo };
}

/** Job boards churn thousands of advert URLs; one advert's clicks say nothing,
 * so their movers are summed per section ("/jobs/ pages"). */
function sectionOf(url: string) {
  try {
    const parsed = new URL(url);
    const first = parsed.pathname.split("/").filter(Boolean)[0];
    return first
      ? `${parsed.protocol}//${parsed.host}/${first}/`
      : `${parsed.protocol}//${parsed.host}/`;
  } catch {
    return url;
  }
}

/** One key per page however Search Console spells it: http/https and www or
 * not are the same page, so they never show as gaining and losing at once. */
function pageKey(url: string) {
  return url
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/\/$/, "");
}

function foldFragments(
  rows: { page: string; clicks: number }[],
  bySection: boolean,
  display: Map<string, string>,
) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const whole = row.page.split("#", 1)[0] ?? row.page;
    const url = bySection ? sectionOf(whole) : whole;
    const page = pageKey(url);
    if (!display.has(page)) display.set(page, url);
    map.set(page, (map.get(page) ?? 0) + row.clicks);
  }
  return map;
}

/** Top gainer and top loser by click change, page by page. URL fragments
 * (jump links) fold into their page so one page is never split in two. */
export function pageMovers(
  current: { page: string; clicks: number }[],
  previous: { page: string; clicks: number }[],
  options: { bySection?: boolean } = {},
): { gained: PageMover | null; lost: PageMover | null } {
  const bySection = options.bySection === true;
  const display = new Map<string, string>();
  const cur = foldFragments(current, bySection, display);
  const prev = foldFragments(previous, bySection, display);
  const pages = new Set([...cur.keys(), ...prev.keys()]);
  const deltas = [...pages].map((page) => ({
    page: display.get(page) ?? page,
    clicks: cur.get(page) ?? 0,
    delta: (cur.get(page) ?? 0) - (prev.get(page) ?? 0),
    ...(bySection ? { section: true } : {}),
  }));
  const ordered = sort(deltas, (a, z) => z.delta - a.delta);
  const top = ordered[0];
  const bottom = ordered.at(-1);
  return {
    gained: top && top.delta > 0 ? top : null,
    lost: bottom && bottom.delta < 0 ? bottom : null,
  };
}
