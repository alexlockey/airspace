import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { getProjectRecommendations } from "@/serverFunctions/portfolio";

// Airspace fork: the unified "what should I do next" card the original
// platform scope asked for (section 8). Rule-derived, evidence-cited, free.
const PRIORITY_CHIP: Record<number, string> = {
  1: "status-chip status-chip-critical",
  2: "status-chip status-chip-warn",
  3: "status-chip status-chip-muted",
};
const PRIORITY_LABEL: Record<number, string> = {
  1: "Act",
  2: "Review",
  3: "Setup",
};

type Rec = Awaited<ReturnType<typeof getProjectRecommendations>>[number];

/** Each recommendation links to the page where it is acted on. TanStack Link
 * needs literal routes, hence the switch. */
function RecLink({
  rec,
  projectId,
  children,
  className,
}: {
  rec: Rec;
  projectId: string;
  children: ReactNode;
  className: string;
}) {
  const props = { params: { projectId }, className, title: rec.evidence };
  switch (rec.target) {
    case "audit":
      return (
        <Link to="/p/$projectId/audit" {...props}>
          {children}
        </Link>
      );
    case "backlinks":
      return (
        <Link
          to="/p/$projectId/backlinks"
          search={{}}
          params={{ projectId }}
          className={className}
          title={rec.evidence}
        >
          {children}
        </Link>
      );
    case "rank-tracking":
      return (
        <Link to="/p/$projectId/rank-tracking" search={{}} {...props}>
          {children}
        </Link>
      );
    case "search-performance":
      return (
        <Link to="/p/$projectId/search-performance" {...props}>
          {children}
        </Link>
      );
    default:
      return (
        <Link to="/p/$projectId" {...props}>
          {children}
        </Link>
      );
  }
}

export function RecommendedActionsCard({ projectId }: { projectId: string }) {
  const recsQuery = useQuery({
    queryKey: ["recommendations", projectId],
    queryFn: () => getProjectRecommendations({ data: { projectId } }),
  });
  const recs = recsQuery.data ?? [];

  return (
    <section className="rounded-lg border border-base-300 bg-base-100 p-4">
      <div className="flex items-center gap-2">
        <ListChecks className="size-4 text-base-content/60" />
        <h2 className="font-semibold">Recommended actions</h2>
      </div>
      {recsQuery.isLoading ? (
        <div className="flex justify-center py-6">
          <span className="loading loading-spinner loading-sm" />
        </div>
      ) : recsQuery.isError ? (
        <p className="mt-2 text-sm text-status-critical">
          Recommendations failed to load. Refresh to retry; findings are NOT
          clear until this loads.
        </p>
      ) : recs.length === 0 ? (
        <p className="mt-2 text-sm text-base-content/50">
          Nothing needs attention. New findings appear here as audits, rank
          checks and Search Console data come in.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {recs.map((rec) => (
            <li key={`${rec.category}-${rec.title}`}>
              <RecLink
                rec={rec}
                projectId={projectId}
                className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-base-200/60"
              >
                <span
                  className={`${PRIORITY_CHIP[rec.priority]} mt-0.5 shrink-0`}
                >
                  {PRIORITY_LABEL[rec.priority]}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{rec.title}</span>
                  <span className="block text-xs text-base-content/50">
                    {rec.evidence}
                  </span>
                </span>
              </RecLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
