import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { Sparkline } from "@/client/components/Sparkline";
import { getProjectTrend } from "@/serverFunctions/portfolio";

// Airspace fork: the three-line state of this site (direction, driver, next
// step) plus authority over time, from the stored portfolio copy.

type TrendData = NonNullable<Awaited<ReturnType<typeof getProjectTrend>>>;

function DirectionIcon({ direction }: { direction: TrendData["trend"]["direction"] }) {
  if (direction === "up")
    return <ArrowUpRight className="size-4 shrink-0 text-status-good" />;
  if (direction === "down")
    return <ArrowDownRight className="size-4 shrink-0 text-status-critical" />;
  return <ArrowRight className="size-4 shrink-0 text-muted-foreground" />;
}

function AuthorityBlock({ authority }: { authority: TrendData["authority"] }) {
  const dr = authority.ahrefsDr;
  const rank = authority.dataforseoRank;
  const series = rank?.series ?? dr?.series ?? [];
  if (!dr && !rank) {
    return (
      <p className="text-xs text-muted-foreground">
        Authority history builds monthly.
      </p>
    );
  }
  return (
    <div className="flex items-end gap-4">
      {dr ? (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Domain Rating
          </div>
          <div className="text-lg font-semibold tabular-nums">
            {dr.latest}
            {dr.change12m !== null && Math.abs(dr.change12m) >= 1 ? (
              <span
                className={`ml-1 text-xs ${dr.change12m > 0 ? "text-status-good" : "text-status-critical"}`}
              >
                {dr.change12m > 0 ? "+" : ""}
                {dr.change12m}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      {rank ? (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Authority rank
          </div>
          <div className="text-lg font-semibold tabular-nums">
            {rank.latest}
            {rank.change3m !== null && Math.abs(rank.change3m) >= 1 ? (
              <span
                className={`ml-1 text-xs ${rank.change3m > 0 ? "text-status-good" : "text-status-critical"}`}
              >
                {rank.change3m > 0 ? "+" : ""}
                {rank.change3m} in 3m
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      {series.length >= 2 ? (
        <Sparkline
          values={series.map((point) => point.value)}
          className="h-9 w-28 text-status-info"
        />
      ) : null}
    </div>
  );
}

export function TrendSummaryCard({ projectId }: { projectId: string }) {
  const query = useQuery({
    queryKey: ["projectTrend", projectId],
    queryFn: () => getProjectTrend({ data: { projectId } }),
  });
  const data = query.data;
  if (query.isLoading || query.isError || !data) return null;
  const { trend } = data;
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1 text-sm">
          <p className="flex items-start gap-1.5 font-medium">
            <DirectionIcon direction={trend.direction} />
            <span>{trend.state}</span>
          </p>
          {trend.driver ? (
            <p className="pl-[22px] text-muted-foreground">{trend.driver}</p>
          ) : null}
          <p className="pl-[22px] text-muted-foreground">{trend.todo}</p>
        </div>
        <div className="shrink-0">
          <AuthorityBlock authority={data.authority} />
        </div>
      </div>
    </section>
  );
}
