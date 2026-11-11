import { sort } from "remeda";

// Airspace fork: turn stored authority points into what a person reads at a
// glance: the latest value, the change over three and twelve months, and a
// short series for a sparkline. Pure, so it is tested without a database.

export type AuthorityInputPoint = {
  source: "dataforseo_rank" | "ahrefs_dr";
  date: string;
  value: number;
  referringDomains: number | null;
};

export type AuthoritySeriesSummary = {
  latest: number;
  latestDate: string;
  /** Change against the newest point at least ~3 months older, or null. */
  change3m: number | null;
  change3mFrom: string | null;
  /** Change against the oldest point within ~12 months, or null. */
  change12m: number | null;
  change12mFrom: string | null;
  series: { date: string; value: number }[];
};

export type AuthoritySummary = {
  /** Ahrefs Domain Rating, when any point has been recorded. */
  ahrefsDr: AuthoritySeriesSummary | null;
  /** DataForSEO domain rank on its 0-100 scale, monthly. */
  dataforseoRank: AuthoritySeriesSummary | null;
};

const DAY_MS = 86_400_000;
const THREE_MONTHS_DAYS = 80;
const TWELVE_MONTHS_DAYS = 370;
const SERIES_POINTS = 13;

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function summarizeSeries(
  points: AuthorityInputPoint[],
): AuthoritySeriesSummary | null {
  if (points.length === 0) return null;
  const ordered = sort(points, (a, z) => a.date.localeCompare(z.date));
  const last = ordered[ordered.length - 1];
  if (!last) return null;
  const lastMs = Date.parse(last.date);
  const before = (days: number) =>
    ordered.filter((point) => Date.parse(point.date) <= lastMs - days * DAY_MS);
  const threeBack = before(THREE_MONTHS_DAYS).at(-1) ?? null;
  const yearWindow = ordered.filter(
    (point) =>
      Date.parse(point.date) >= lastMs - TWELVE_MONTHS_DAYS * DAY_MS &&
      point !== last,
  );
  const yearBack = yearWindow[0] ?? null;
  return {
    latest: round1(last.value),
    latestDate: last.date,
    change3m: threeBack ? round1(last.value - threeBack.value) : null,
    change3mFrom: threeBack?.date ?? null,
    change12m: yearBack ? round1(last.value - yearBack.value) : null,
    change12mFrom: yearBack?.date ?? null,
    series: ordered
      .slice(-SERIES_POINTS)
      .map((point) => ({ date: point.date, value: round1(point.value) })),
  };
}

export function summarizeAuthority(
  points: AuthorityInputPoint[],
): AuthoritySummary {
  return {
    ahrefsDr: summarizeSeries(points.filter((p) => p.source === "ahrefs_dr")),
    dataforseoRank: summarizeSeries(
      points.filter((p) => p.source === "dataforseo_rank"),
    ),
  };
}
