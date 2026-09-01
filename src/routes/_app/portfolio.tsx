import type { ReactNode } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Radar } from "lucide-react";
import { getPortfolioOverview } from "@/serverFunctions/portfolio";
import { Sparkline } from "@/client/components/Sparkline";

export const Route = createFileRoute("/_app/portfolio")({
  component: PortfolioPage,
});

type PortfolioRow = Awaited<ReturnType<typeof getPortfolioOverview>>[number];
type Severity = PortfolioRow["severity"];

const severityOrder: Record<Severity, number> = {
  critical: 0,
  warn: 1,
  nodata: 2,
  good: 3,
};

const severityChip: Record<Severity, { label: string; className: string }> = {
  critical: { label: "Act now", className: "status-chip status-chip-critical" },
  warn: { label: "Review", className: "status-chip status-chip-warn" },
  nodata: { label: "No data yet", className: "status-chip status-chip-muted" },
  good: { label: "Healthy", className: "status-chip status-chip-good" },
};

function pctDelta(current: number, previous: number): string | null {
  if (previous <= 0) return null;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return null;
  return `${pct > 0 ? "+" : ""}${Math.round(pct)}%`;
}

function healthClass(health: number | null) {
  if (health === null) return "text-base-content/40";
  if (health >= 80) return "text-status-good";
  if (health >= 55) return "text-status-warn";
  return "text-status-critical";
}

function Stat({
  label,
  value,
  delta,
  valueClass,
}: {
  label: string;
  value: string;
  delta?: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-base-content/40">
        {label}
      </div>
      <div
        className={`truncate text-lg font-semibold tabular-nums ${valueClass ?? ""}`}
      >
        {value}
        {delta}
      </div>
    </div>
  );
}

function DeltaText({
  tone,
  children,
}: {
  tone: "good" | "bad";
  children: ReactNode;
}) {
  return (
    <span
      className={`ml-1 text-xs font-medium ${
        tone === "bad" ? "text-status-critical" : "text-status-good"
      }`}
    >
      {children}
    </span>
  );
}

function SiteCardStats({ row }: { row: PortfolioRow }) {
  const gsc = row.gsc.connected ? row.gsc : null;
  const clicksDelta = gsc
    ? pctDelta(gsc.totals.clicks, gsc.prevTotals.clicks)
    : null;
  const newRefs = row.backlinks?.newReferringDomains ?? 0;
  const lostRefs = row.backlinks?.lostReferringDomains ?? 0;
  return (
    <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-6">
      <Stat
        label="Health"
        value={row.health === null ? "-" : String(row.health)}
        valueClass={healthClass(row.health)}
      />
      <Stat
        label="Clicks 28d"
        value={gsc ? gsc.totals.clicks.toLocaleString() : "-"}
        delta={
          clicksDelta ? (
            <DeltaText tone={clicksDelta.startsWith("-") ? "bad" : "good"}>
              {clicksDelta}
            </DeltaText>
          ) : null
        }
      />
      <Stat
        label="Rank"
        value={row.backlinks?.rank != null ? String(row.backlinks.rank) : "-"}
      />
      <Stat
        label="Ref domains"
        value={row.backlinks?.referringDomains?.toLocaleString() ?? "-"}
        delta={
          newRefs > 0 || lostRefs > 0 ? (
            <>
              {newRefs > 0 ? (
                <DeltaText tone="good">+{newRefs}</DeltaText>
              ) : null}
              {lostRefs > 0 ? (
                <DeltaText tone="bad">-{lostRefs}</DeltaText>
              ) : null}
            </>
          ) : null
        }
      />
      <Stat
        label="Backlinks"
        value={row.backlinks?.backlinks?.toLocaleString() ?? "-"}
      />
      <Stat
        label="Tracked kw"
        value={row.rank ? String(row.rank.trackedKeywords) : "-"}
        delta={
          row.rank && (row.rank.improved > 0 || row.rank.declined > 0) ? (
            <>
              {row.rank.improved > 0 ? (
                <DeltaText tone="good">▲{row.rank.improved}</DeltaText>
              ) : null}
              {row.rank.declined > 0 ? (
                <DeltaText tone="bad">▼{row.rank.declined}</DeltaText>
              ) : null}
            </>
          ) : null
        }
      />
    </div>
  );
}

function SiteCard({ row }: { row: PortfolioRow }) {
  const severity = row.severity;
  const chip = severityChip[severity];
  const gsc = row.gsc.connected ? row.gsc : null;
  const gscEmptyLabel = row.gsc.connected
    ? "no data in range"
    : row.gsc.errored
      ? "GSC error, retrying next load"
      : "GSC not connected";
  const topRec = row.recommendations[0] ?? null;
  const refSpark = row.refdomainHistory
    .map((point) => point.referringDomains)
    .filter((value): value is number => value !== null);
  const tint =
    severity === "critical"
      ? "status-row-critical"
      : severity === "warn"
        ? "status-row-warn"
        : "";

  return (
    <div
      className={`rounded-lg border border-base-300 bg-base-100 p-4 ${tint}`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          to="/p/$projectId"
          params={{ projectId: row.project.id }}
          className="min-w-0 hover:underline"
        >
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold">{row.project.name}</span>
            {row.project.siteType !== "standard" ? (
              <span className="status-chip status-chip-info">
                {row.project.siteType === "job_board"
                  ? "Job board"
                  : "Directory"}
              </span>
            ) : null}
          </div>
          <div className="truncate text-xs text-base-content/50">
            {row.project.domain ?? "No domain set"}
          </div>
        </Link>
        <span className={chip.className}>{chip.label}</span>
      </div>

      {row.loadError ? (
        <p className="mt-3 text-sm text-status-critical">
          This site's data failed to load. Refresh to retry; the rest of the
          estate is unaffected.
        </p>
      ) : (
        <>
          <SiteCardStats row={row} />

          <div className="mt-3 flex items-end gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-base-content/40">
                GSC clicks, daily 28d
              </div>
              {gsc && gsc.daily.length >= 2 ? (
                <Sparkline
                  values={gsc.daily.map((point) => point.clicks)}
                  className="mt-1 h-9 w-full text-primary"
                />
              ) : (
                <div className="mt-1 flex h-9 items-center text-xs text-base-content/30">
                  {gscEmptyLabel}
                </div>
              )}
            </div>
            <div className="w-28 shrink-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-base-content/40">
                Ref domains
              </div>
              {refSpark.length >= 2 ? (
                <Sparkline
                  values={refSpark}
                  className="mt-1 h-9 w-full text-status-info"
                />
              ) : (
                <div className="mt-1 flex h-9 items-center text-xs text-base-content/30">
                  history builds daily
                </div>
              )}
            </div>
          </div>

          {topRec ? (
            <Link
              to="/p/$projectId"
              params={{ projectId: row.project.id }}
              className="mt-3 block rounded-md bg-base-200/60 px-3 py-2 text-xs hover:bg-base-200"
              title={topRec.evidence}
            >
              <span
                className={
                  topRec.priority === 1
                    ? "font-semibold text-status-critical"
                    : topRec.priority === 2
                      ? "font-semibold text-status-warn"
                      : "font-semibold text-base-content/60"
                }
              >
                Next:
              </span>{" "}
              {topRec.title}
              {row.recommendations.length > 1 ? (
                <span className="text-base-content/40">
                  {" "}
                  · +{row.recommendations.length - 1} more
                </span>
              ) : null}
            </Link>
          ) : null}
        </>
      )}
    </div>
  );
}

function PortfolioPage() {
  const portfolioQuery = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => getPortfolioOverview(),
  });

  const rows = (portfolioQuery.data ?? []).toSorted(
    (a, z) => severityOrder[a.severity] - severityOrder[z.severity],
  );

  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-8 pb-24 md:px-6 md:py-12 md:pb-8">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Radar className="size-6 text-status-critical" />
            Portfolio
          </h1>
          <p className="mt-1 text-sm text-base-content/60">
            Every tracked site, worst first: health, real GSC clicks, link
            profile, tracked movement and the next action. Colours carry
            meaning: red act, amber review, green healthy.
          </p>
        </div>

        {portfolioQuery.isLoading ? (
          <div className="flex justify-center py-10">
            <span className="loading loading-spinner loading-md" />
          </div>
        ) : portfolioQuery.isError ? (
          <div className="alert alert-error">
            <span>
              The portfolio failed to load. Refresh to retry; if it persists,
              check /api/health.
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {rows.map((row) => (
              <SiteCard key={row.project.id} row={row} />
            ))}
          </div>
        )}

        <p className="text-xs text-base-content/40">
          Stored snapshots plus free Search Console data; visiting a project
          dashboard refreshes its snapshots. Backlink deltas are the provider's
          reporting period; clicks compare the previous 28 days.
        </p>
      </div>
    </div>
  );
}
