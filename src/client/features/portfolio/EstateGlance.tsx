import { sort } from "remeda";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { getPortfolioOverview } from "@/serverFunctions/portfolio";

// Airspace fork: the at-a-glance pieces of the Portfolio page: the estate
// table, a site's three trend lines and the authority label.

export type PortfolioData = Awaited<ReturnType<typeof getPortfolioOverview>>;
export type PortfolioRow = PortfolioData["rows"][number];
type TrendDirection = PortfolioRow["trend"]["direction"];

const trendOrder: Record<TrendDirection, number> = {
  down: 0,
  up: 1,
  steady: 2,
  nodata: 3,
};

export function TrendIcon({ direction }: { direction: TrendDirection }) {
  if (direction === "up")
    return <ArrowUpRight className="size-4 shrink-0 text-status-good" />;
  if (direction === "down")
    return <ArrowDownRight className="size-4 shrink-0 text-status-critical" />;
  return <ArrowRight className="size-4 shrink-0 text-muted-foreground" />;
}

/** "DR 11 (+6 since 13 Aug)" from Ahrefs points, else the DataForSEO rank. */
export function authorityLabel(row: PortfolioRow): {
  label: string;
  value: string;
  change: number | null;
  since: string | null;
} {
  const dr = row.authority.ahrefsDr;
  if (dr) {
    return {
      label: "Domain Rating",
      value: String(dr.latest),
      change: dr.change12m ?? dr.change3m,
      since: dr.change12mFrom ?? dr.change3mFrom,
    };
  }
  const rank = row.authority.dataforseoRank;
  if (rank) {
    return {
      label: "Authority",
      value: String(rank.latest),
      change: rank.change3m ?? rank.change12m,
      since: rank.change3mFrom ?? rank.change12mFrom,
    };
  }
  return {
    label: "Authority",
    value: row.backlinks?.rank != null ? String(row.backlinks.rank) : "-",
    change: null,
    since: null,
  };
}

function shortDay(iso: string | null) {
  if (!iso) return "";
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function minutesAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}
type Severity = PortfolioRow["severity"];



export const severityOrder: Record<Severity, number> = {
  critical: 0,
  warn: 1,
  nodata: 2,
  good: 3,
};

export function TrendLines({ row }: { row: PortfolioRow }) {
  const { trend } = row;
  return (
    <div className="mt-3 space-y-1 text-sm">
      <p className="flex items-start gap-1.5 font-medium">
        <TrendIcon direction={trend.direction} />
        <span>{trend.state}</span>
      </p>
      {trend.driver ? (
        <p className="pl-[22px] text-muted-foreground">{trend.driver}</p>
      ) : null}
      <p className="pl-[22px] text-muted-foreground">{trend.todo}</p>
    </div>
  );
}

/** One line per site, worst news first: the at-a-glance read of the estate. */
export function EstateGlance({ rows }: { rows: PortfolioRow[] }) {
  const counts = { up: 0, down: 0, steady: 0, nodata: 0 };
  for (const row of rows) counts[row.trend.direction] += 1;
  const ordered = sort(
    rows,
    (a, z) =>
      trendOrder[a.trend.direction] - trendOrder[z.trend.direction] ||
      severityOrder[a.severity] - severityOrder[z.severity],
  );
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="font-semibold">Estate at a glance</h2>
        <span className="text-sm text-muted-foreground">
          Last 28 days on the 28 before:{" "}
          <span className="font-medium text-status-good">{counts.up} up</span>
          {" · "}
          <span className="font-medium text-status-critical">
            {counts.down} down
          </span>
          {" · "}
          {counts.steady} steady
          {counts.nodata > 0 ? ` · ${counts.nodata} without Search Console` : ""}
        </span>
      </div>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="pb-1 pr-3 font-semibold">Site</th>
            <th className="pb-1 pr-3 font-semibold">Search</th>
            <th className="hidden pb-1 pr-3 font-semibold md:table-cell">
              Authority
            </th>
            <th className="hidden pb-1 font-semibold lg:table-cell">Do next</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((row) => {
            const authority = authorityLabel(row);
            return (
              <tr key={row.project.id} className="border-t border-border/60">
                <td className="py-1.5 pr-3">
                  <a
                    href={`#site-${row.project.id}`}
                    className="font-medium hover:underline"
                  >
                    {row.project.name}
                  </a>
                </td>
                <td className="py-1.5 pr-3">
                  <span className="inline-flex items-center gap-1">
                    <TrendIcon direction={row.trend.direction} />
                    {row.trend.headline}
                  </span>
                </td>
                <td className="hidden py-1.5 pr-3 tabular-nums md:table-cell">
                  {authority.value === "-"
                    ? "-"
                    : `${authority.label === "Domain Rating" ? "DR" : "Rank"} ${authority.value}`}
                  {authority.change !== null && Math.abs(authority.change) >= 1 ? (
                    <span
                      className={
                        authority.change > 0
                          ? "ml-1 text-xs text-status-good"
                          : "ml-1 text-xs text-status-critical"
                      }
                    >
                      {authority.change > 0 ? "+" : ""}
                      {authority.change}
                      {authority.since ? ` since ${shortDay(authority.since)}` : ""}
                    </span>
                  ) : null}
                </td>
                <td className="hidden max-w-md truncate py-1.5 text-muted-foreground lg:table-cell">
                  {row.recommendations[0]?.title ?? "Nothing urgent"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

