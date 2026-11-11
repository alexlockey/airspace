import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import type { PortfolioRow } from "@/client/features/portfolio/EstateGlance";

function shortPath(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.hostname}${path}`.slice(0, 48);
  } catch {
    return url.slice(0, 48);
  }
}

function daysAgo(iso: string) {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const days = Math.max(0, Math.floor(ms / 86_400_000));
  return days === 0 ? "today" : days === 1 ? "1d ago" : `${days}d ago`;
}

/** New clean links: the good news row. Green when there is something to
 * celebrate, muted otherwise, and every entry opens the linking page. */
export function NewLinksRow({ row }: { row: PortfolioRow }) {
  const { newLinks } = row;
  const domain = row.project.domain;
  if (!newLinks.tracked || !domain) {
    return (
      <div className="mt-3 text-xs text-muted-foreground/70">
        New links appear after the first daily snapshot.
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-md border border-border/60 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span
          className={
            newLinks.cleanCount > 0
              ? "status-chip status-chip-good"
              : "status-chip status-chip-muted"
          }
        >
          {newLinks.cleanCount > 0
            ? `+${newLinks.cleanCount} new clean link${
                newLinks.cleanCount === 1 ? "" : "s"
              }`
            : "No new clean links (30d)"}
        </span>
        <Link
          to="/p/$projectId/backlinks"
          params={{ projectId: row.project.id }}
          search={{
            target: domain,
            scope: "subdomains",
            tab: "backlinks",
            sort: "firstSeen",
            order: "desc",
          }}
          className="text-xs text-primary hover:underline"
        >
          All recent links
        </Link>
      </div>
      {newLinks.shown.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {newLinks.shown.map((link) => (
            <li key={link.urlFrom} className="flex items-center gap-2 text-xs">
              <a
                href={link.urlFrom}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-w-0 items-center gap-1 font-medium hover:underline"
                title={link.urlFrom}
              >
                <span className="truncate">{link.domainFrom}</span>
                <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
              </a>
              <span className="truncate text-muted-foreground">
                {link.urlTo ? `→ ${shortPath(link.urlTo)}` : ""}
              </span>
              <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                {link.isDofollow === false ? "nofollow · " : ""}
                spam {link.spamScore} · {daysAgo(link.firstSeen)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

