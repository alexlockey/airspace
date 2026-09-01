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

// Recommendation targets map onto project routes; keep as plain segments and
// build hrefs relative to the project root.
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
      ) : recs.length === 0 ? (
        <p className="mt-2 text-sm text-base-content/50">
          Nothing needs attention. New findings appear here as audits, rank
          checks and Search Console data come in.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {recs.map((rec) => (
            <li key={`${rec.category}-${rec.title}`}>
              <Link
                to={"/p/$projectId" as const}
                params={{ projectId }}
                className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-base-200/60"
                title={rec.evidence}
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
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
