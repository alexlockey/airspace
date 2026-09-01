import { ShieldAlert, ShieldCheck } from "lucide-react";
import {
  EMPTY_BACKLINKS_FILTERS,
  EMPTY_REFERRING_DOMAINS_FILTERS,
} from "./backlinksFilterTypes";
import type { BacklinksSearchState } from "./backlinksPageTypes";
import type { BacklinksFiltersState } from "./useBacklinksFilters";

/** One-click filter presets so seeing past spam never requires typing filter
 * values: Clean links hides spam-scored, lost and broken rows; Spam review
 * shows only disavow candidates (spam score 40+). */
export function BacklinksFilterPresets({
  activeTab,
  filters,
  onPageChange,
}: {
  activeTab: BacklinksSearchState["tab"];
  filters: BacklinksFiltersState;
  onPageChange: (nextPage: number) => void;
}) {
  if (activeTab === "pages") return null;

  const applyClean = () => {
    if (activeTab === "backlinks") {
      filters.backlinks.apply({
        ...EMPTY_BACKLINKS_FILTERS,
        maxSpamScore: "29",
        hideLost: "true",
        hideBroken: "true",
      });
    } else {
      filters.domains.apply({
        ...EMPTY_REFERRING_DOMAINS_FILTERS,
        maxSpamScore: "29",
      });
    }
    onPageChange(1);
  };

  const applySpamReview = () => {
    if (activeTab === "backlinks") {
      filters.backlinks.apply({
        ...EMPTY_BACKLINKS_FILTERS,
        minSpamScore: "40",
      });
    } else {
      filters.domains.apply({
        ...EMPTY_REFERRING_DOMAINS_FILTERS,
        minSpamScore: "40",
      });
    }
    onPageChange(1);
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm gap-1.5"
        title="One click: hide spam-scored, lost and broken links (spam score under 30)"
        onClick={applyClean}
      >
        <ShieldCheck className="size-3.5" />
        Clean links
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm gap-1.5"
        title="One click: show only links with spam score 40 and above, for disavow review"
        onClick={applySpamReview}
      >
        <ShieldAlert className="size-3.5" />
        Spam review
      </button>
    </>
  );
}
