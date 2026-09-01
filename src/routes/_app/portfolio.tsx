import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Radar } from "lucide-react";
import { getPortfolioOverview } from "@/serverFunctions/portfolio";

export const Route = createFileRoute("/_app/portfolio")({
  component: PortfolioPage,
});

type PortfolioRow = Awaited<ReturnType<typeof getPortfolioOverview>>[number];
type Severity = "critical" | "warn" | "nodata" | "good";

// One severity per site so the table can sort worst-first and the row tint
// reads at a glance: red = act, amber = review, grey = not set up, green = ok.
function rowSeverity(row: PortfolioRow): Severity {
  const { rank, audit, backlinks } = row;
  if (audit?.topIssues.some((issue) => issue.severity === "critical")) {
    return "critical";
  }
  const lostRefs = backlinks?.lostReferringDomains ?? 0;
  const newRefs = backlinks?.newReferringDomains ?? 0;
  if (backlinks && lostRefs > newRefs && lostRefs > 0) return "critical";
  if ((rank?.declined ?? 0) > (rank?.improved ?? 0)) return "warn";
  if (audit?.topIssues.some((issue) => issue.severity === "warning")) {
    return "warn";
  }
  if (backlinks?.stale) return "warn";
  if (!rank && !audit && !backlinks) return "nodata";
  return "good";
}

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

const rowTint: Record<Severity, string> = {
  critical: "status-row-critical",
  warn: "status-row-warn",
  nodata: "",
  good: "",
};

function Delta({ up, down }: { up: number | null; down: number | null }) {
  if (up === null && down === null) return null;
  return (
    <span className="ml-1 text-xs">
      {up !== null && up > 0 ? (
        <span className="text-status-good">+{up}</span>
      ) : null}
      {up !== null && up > 0 && down !== null && down > 0 ? " " : null}
      {down !== null && down > 0 ? (
        <span className="text-status-critical">-{down}</span>
      ) : null}
    </span>
  );
}

function PortfolioPage() {
  const portfolioQuery = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => getPortfolioOverview(),
  });

  const rows = (portfolioQuery.data ?? [])
    .map((row) => ({ row, severity: rowSeverity(row) }))
    .toSorted((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-8 pb-24 md:px-6 md:py-12 md:pb-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <Radar className="size-6 text-status-critical" />
              Portfolio
            </h1>
            <p className="mt-1 text-sm text-base-content/60">
              Every tracked site at a glance, worst first. Colours carry
              meaning: red needs action, amber needs a look, green is healthy.
            </p>
          </div>
        </div>

        {portfolioQuery.isLoading ? (
          <div className="flex justify-center py-10">
            <span className="loading loading-spinner loading-md" />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-base-300">
            <table className="table table-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-base-content/50">
                  <th>Site</th>
                  <th>Status</th>
                  <th className="text-right">Authority</th>
                  <th className="text-right">Ref domains</th>
                  <th className="text-right">Backlinks</th>
                  <th className="text-right">Tracked kw</th>
                  <th>Audit</th>
                  <th>GSC</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ row, severity }) => {
                  const chip = severityChip[severity];
                  const topIssue = row.audit?.topIssues[0] ?? null;
                  return (
                    <tr key={row.project.id} className={rowTint[severity]}>
                      <td>
                        <Link
                          to="/p/$projectId"
                          params={{ projectId: row.project.id }}
                          className="flex min-w-0 flex-col hover:underline"
                        >
                          <span className="truncate font-medium">
                            {row.project.name}
                          </span>
                          <span className="truncate text-xs text-base-content/50">
                            {row.project.domain ?? "No domain set"}
                          </span>
                        </Link>
                      </td>
                      <td>
                        <span className={chip.className}>{chip.label}</span>
                      </td>
                      <td className="text-right tabular-nums">
                        {row.backlinks?.rank ?? "-"}
                      </td>
                      <td className="text-right tabular-nums">
                        {row.backlinks?.referringDomains?.toLocaleString() ??
                          "-"}
                        <Delta
                          up={row.backlinks?.newReferringDomains ?? null}
                          down={row.backlinks?.lostReferringDomains ?? null}
                        />
                      </td>
                      <td className="text-right tabular-nums">
                        {row.backlinks?.backlinks?.toLocaleString() ?? "-"}
                      </td>
                      <td className="text-right tabular-nums">
                        {row.rank ? (
                          <>
                            {row.rank.trackedKeywords}
                            <Delta
                              up={row.rank.improved}
                              down={row.rank.declined}
                            />
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="max-w-48">
                        {topIssue ? (
                          <span
                            className={
                              topIssue.severity === "critical"
                                ? "text-status-critical"
                                : topIssue.severity === "warning"
                                  ? "text-status-warn"
                                  : "text-base-content/60"
                            }
                          >
                            <span className="truncate text-xs">
                              {topIssue.issueType} ({topIssue.count})
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-base-content/40">
                            {row.audit ? "No issues" : "No audit yet"}
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className={
                            row.gscConnected
                              ? "status-dot status-dot-good"
                              : "status-dot status-dot-muted"
                          }
                          title={
                            row.gscConnected
                              ? "Search Console connected"
                              : "Search Console not connected"
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-base-content/40">
          Reads stored snapshots only; visiting a project dashboard refreshes
          its data. Deltas are 7-day movement where tracked.
        </p>
      </div>
    </div>
  );
}
