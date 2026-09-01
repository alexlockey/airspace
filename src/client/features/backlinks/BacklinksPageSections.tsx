import { useEffect, useMemo } from "react";
import {
  FileDown,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import {
  EMPTY_BACKLINKS_FILTERS,
  EMPTY_REFERRING_DOMAINS_FILTERS,
} from "./backlinksFilterTypes";
import type { OnChangeFn, SortingState } from "@tanstack/react-table";
import { BacklinksFilterPanel } from "./BacklinksFilterPanel";
import { BacklinksTable } from "./BacklinksTable";
import { ReferringDomainsTable } from "./ReferringDomainsTable";
import { TopPagesTable } from "./TopPagesTable";
import type {
  BacklinksSearchState,
  BacklinksTabRows,
} from "./backlinksPageTypes";
import { TAB_DESCRIPTIONS } from "./backlinksPageUtils";
import {
  BacklinksActionsMenu,
  BacklinksExportMenu,
} from "./BacklinksToolbarMenus";
import { buildBacklinksTabExport } from "./export";
import type { BacklinksDomainExpansion } from "./useBacklinksDomainExpansion";
import type { BacklinksFiltersState } from "./useBacklinksFilters";
import { useAhrefsDomainRatings } from "./useAhrefsDomainRatings";
import { TablePagination } from "@/client/components/table/TablePagination";
import {
  BACKLINKS_PAGE_SIZES,
  type BacklinksTab,
} from "@/types/schemas/backlinks";
import { MAX_DATAFORSEO_FILTER_CONDITIONS } from "@/types/schemas/domain";
import {
  BACKLINKS_SUBFOLDER_FILTER_CONDITIONS,
  type ResearchScope,
} from "@/shared/researchScope";

const BACKLINKS_RESULTS_TABS: Array<{
  tab: BacklinksSearchState["tab"];
  label: string;
}> = [
  { tab: "backlinks", label: "Backlinks" },
  { tab: "domains", label: "Referring Domains" },
  { tab: "pages", label: "Top Pages" },
];

export function BacklinksResultsCard({
  projectId,
  activeTab,
  scope,
  tabRows,
  filters,
  sorting,
  view,
  domainExpansion,
  isTabLoading,
  tabErrorMessage,
  exportTarget,
  summary,
  pagination,
  onPageChange,
  onPageSizeChange,
  onSortingChange,
  onTabChange,
  onViewChange,
}: {
  projectId: string;
  activeTab: BacklinksSearchState["tab"];
  scope: ResearchScope;
  tabRows: BacklinksTabRows;
  filters: BacklinksFiltersState;
  sorting: SortingState;
  view: "all" | undefined;
  domainExpansion: BacklinksDomainExpansion;
  isTabLoading: boolean;
  tabErrorMessage: string | null;
  exportTarget: string;
  /** Overview totals for the reconciling line: grouped views must say how
   * many links sit behind the domain count, or trust in the numbers dies. */
  summary?: {
    backlinks: number | null;
    referringDomains: number | null;
  } | null;
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number | null;
    hasNextPage: boolean;
    isFetching: boolean;
  };
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextPageSize: number) => void;
  onSortingChange: OnChangeFn<SortingState>;
  onTabChange: (tab: BacklinksSearchState["tab"]) => void;
  onViewChange: (view: "all" | undefined) => void;
}) {
  const {
    ratings: domainRatings,
    isLoading: isLoadingRatings,
    loadRatings,
  } = useAhrefsDomainRatings(projectId);
  const activeFilterCount = filters[activeTab].activeFilterCount;
  const exportTable = useMemo(
    () =>
      buildBacklinksTabExport({ tab: activeTab, rows: tabRows, domainRatings }),
    [activeTab, domainRatings, tabRows],
  );
  // Domains keyed by both tables that the DR column can enrich. Each table
  // holds the currently loaded page, so this changes as the user paginates.
  const ratableDomains = useMemo(
    () => collectRatableDomains(tabRows),
    [tabRows],
  );
  // Once the user has opted in, keep newly loaded domains enriched without a
  // re-click (e.g. after paging or switching to the Referring Domains tab).
  // KV-cached, so re-requesting already-known domains is nearly free.
  useEffect(() => {
    if (!domainRatings) return;
    const missing = ratableDomains.filter(
      (domain) => !Object.hasOwn(domainRatings, domain),
    );
    if (missing.length > 0) void loadRatings(missing);
  }, [domainRatings, ratableDomains, loadRatings]);

  return (
    <div className="border border-base-300 rounded-xl bg-base-100 overflow-hidden">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-3 border-b border-base-300">
        <div className="space-y-2">
          <div role="tablist" className="tabs tabs-border w-fit">
            {BACKLINKS_RESULTS_TABS.filter(
              // Referring domains can't be filtered to a path prefix.
              ({ tab }) => !(scope === "subfolder" && tab === "domains"),
            ).map(({ label, tab }) => (
              <TabLink
                key={tab}
                activeTab={activeTab}
                label={label}
                onSelect={onTabChange}
                tab={tab}
              />
            ))}
          </div>
          <p className="max-w-xl text-sm text-base-content/60">
            {TAB_DESCRIPTIONS[activeTab]}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DisavowExportButton
            activeTab={activeTab}
            exportTarget={exportTarget}
            tabRows={tabRows}
          />
          <BacklinksExportMenu
            activeTab={activeTab}
            exportTarget={exportTarget}
            headers={exportTable.headers}
            rows={exportTable.rows}
          />
          {activeTab !== "pages" ? (
            <BacklinksActionsMenu
              isLoadingRatings={isLoadingRatings}
              loadRatings={loadRatings}
              ratableDomains={ratableDomains}
            />
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-base-300">
        <button
          className={`btn btn-ghost btn-sm gap-1.5 ${filters.showFilters ? "btn-active" : ""}`}
          onClick={() => filters.setShowFilters((current) => !current)}
          title="Toggle table filters"
        >
          <SlidersHorizontal className="size-3.5" />
          Filters
          {activeFilterCount > 0 ? (
            <span className="badge badge-xs badge-primary border-0 text-primary-content">
              {activeFilterCount}
            </span>
          ) : null}
        </button>
        {activeTab !== "pages" ? (
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm gap-1.5"
              title="One click: hide spam-scored, lost and broken links (spam score under 30)"
              onClick={() => {
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
              }}
            >
              <ShieldCheck className="size-3.5" />
              Clean links
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm gap-1.5"
              title="One click: show only links with spam score 40 and above, for disavow review"
              onClick={() => {
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
              }}
            >
              <ShieldAlert className="size-3.5" />
              Spam review
            </button>
          </>
        ) : null}
        {activeTab === "backlinks" &&
        summary?.backlinks != null &&
        summary?.referringDomains != null ? (
          <span className="text-xs text-base-content/50">
            {summary.backlinks.toLocaleString()} links from{" "}
            {summary.referringDomains.toLocaleString()} referring domains
            {view !== "all" ? " · showing one per domain" : ""}
          </span>
        ) : null}
        {activeTab === "backlinks" ? (
          <div
            role="tablist"
            aria-label="Backlinks view"
            className="ml-auto tabs tabs-border tabs-xs w-fit"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view !== "all"}
              className={`tab ${view !== "all" ? "tab-active" : ""}`}
              title="Show each referring domain's strongest link; expand a row for the rest"
              onClick={() => onViewChange(undefined)}
            >
              One per domain
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "all"}
              className={`tab ${view === "all" ? "tab-active" : ""}`}
              title="List every individual backlink"
              onClick={() => onViewChange("all")}
            >
              All links
            </button>
          </div>
        ) : null}
      </div>

      {filters.showFilters ? (
        <BacklinksFilterPanel
          activeTab={activeTab}
          filters={filters}
          onApplied={() => onPageChange(1)}
          // The subfolder url-prefix group (and, on the backlinks tab, the
          // server-appended spam condition) shares the 8-condition budget.
          maxConditions={
            scope === "subfolder"
              ? MAX_DATAFORSEO_FILTER_CONDITIONS -
                BACKLINKS_SUBFOLDER_FILTER_CONDITIONS -
                (activeTab === "pages" ? 0 : 1)
              : undefined
          }
        />
      ) : null}

      <div className="p-4">
        {tabErrorMessage ? (
          <div className="alert alert-error mb-3">
            <span>{tabErrorMessage}</span>
          </div>
        ) : null}
        {isTabLoading && !tabErrorMessage ? (
          <TabLoadingState label={TAB_LOADING_LABELS[activeTab]} />
        ) : null}
        {!isTabLoading && !tabErrorMessage ? (
          <>
            {activeTab === "backlinks" ? (
              <BacklinksTable
                rows={tabRows.backlinks}
                domainRatings={domainRatings}
                sorting={sorting}
                onSortingChange={onSortingChange}
                expansion={view === "all" ? null : domainExpansion}
              />
            ) : null}
            {activeTab === "domains" ? (
              <ReferringDomainsTable
                rows={tabRows.referringDomains}
                domainRatings={domainRatings}
                sorting={sorting}
                onSortingChange={onSortingChange}
              />
            ) : null}
            {activeTab === "pages" ? (
              <TopPagesTable
                rows={tabRows.topPages}
                sorting={sorting}
                onSortingChange={onSortingChange}
              />
            ) : null}
          </>
        ) : null}
      </div>

      {/* Kept visible on tab errors so a failing page still offers a way back. */}
      <TablePagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        pageSizes={BACKLINKS_PAGE_SIZES}
        totalCount={pagination.totalCount}
        hasNextPage={pagination.hasNextPage}
        isLoading={pagination.isFetching}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        unitLabel={
          activeTab === "backlinks"
            ? view === "all"
              ? "links"
              : "referring domains"
            : activeTab === "domains"
              ? "referring domains"
              : "pages"
        }
      />
    </div>
  );
}

const DISAVOW_SPAM_THRESHOLD = 40;
const GOOGLE_DISAVOW_URL =
  "https://search.google.com/search-console/disavow-links";

/** Builds a Google-format disavow file from the CURRENTLY LOADED rows with
 * spam score >= threshold. Deliberately never auto-submits: generating the
 * file is safe, uploading it is a human decision (bad disavows hurt). */
function DisavowExportButton({
  activeTab,
  exportTarget,
  tabRows,
}: {
  activeTab: BacklinksSearchState["tab"];
  exportTarget: string;
  tabRows: BacklinksTabRows;
}) {
  if (activeTab === "pages") return null;
  const domains = [
    ...new Set(
      activeTab === "domains"
        ? tabRows.referringDomains
            .filter(
              (row) =>
                row.domain !== null &&
                (row.spamScore ?? 0) >= DISAVOW_SPAM_THRESHOLD,
            )
            .map((row) => row.domain as string)
        : tabRows.backlinks
            .filter(
              (row) =>
                row.domainFrom !== null &&
                (row.spamScore ?? 0) >= DISAVOW_SPAM_THRESHOLD,
            )
            .map((row) => row.domainFrom as string),
    ),
  ].toSorted();

  const download = () => {
    const lines = [
      `# Disavow file for ${exportTarget}`,
      `# Generated by Airspace on ${new Date().toISOString().slice(0, 10)}`,
      `# Domains from the currently loaded rows with spam score >= ${DISAVOW_SPAM_THRESHOLD}.`,
      `# REVIEW EVERY LINE before uploading. Wrongly disavowing good links harms rankings.`,
      `# Upload at: ${GOOGLE_DISAVOW_URL}`,
      "",
      ...domains.map((domain) => `domain:${domain}`),
      "",
    ].join("\n");
    const blob = new Blob([lines], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `disavow-${exportTarget.replace(/[^a-z0-9.-]/gi, "_")}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    window.open(GOOGLE_DISAVOW_URL, "_blank", "noopener");
  };

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm gap-1.5"
      disabled={domains.length === 0}
      title={
        domains.length === 0
          ? `No loaded rows with spam score >= ${DISAVOW_SPAM_THRESHOLD}. Run Spam review first, and page through if there are more rows.`
          : `Download a disavow file for ${domains.length} spam-scored domains from the loaded rows, and open Google's disavow tool. Review before uploading.`
      }
      onClick={download}
    >
      <FileDown className="size-3.5" />
      Disavow file
      {domains.length > 0 ? (
        <span className="badge badge-xs badge-error border-0 text-error-content">
          {domains.length}
        </span>
      ) : null}
    </button>
  );
}

const TAB_LOADING_LABELS: Record<BacklinksTab, string> = {
  backlinks: "Loading backlinks",
  domains: "Loading referring domains",
  pages: "Loading top pages",
};

/** Unique domains the DR column keys on, from both the backlinks and referring
 * domains tables, normalized to match how each table renders its domain. */
function collectRatableDomains(tabRows: BacklinksTabRows): string[] {
  const domains = [
    ...tabRows.backlinks.map((row) => row.domainFrom?.replace(/^www\./, "")),
    ...tabRows.referringDomains.map((row) => row.domain),
  ];
  return [
    ...new Set(domains.filter((domain): domain is string => Boolean(domain))),
  ];
}

function TabLink({
  activeTab,
  label,
  onSelect,
  tab,
}: {
  activeTab: BacklinksSearchState["tab"];
  label: string;
  onSelect: (tab: BacklinksSearchState["tab"]) => void;
  tab: BacklinksSearchState["tab"];
}) {
  const isActive = activeTab === tab;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      className={`tab ${isActive ? "tab-active" : ""}`}
      onClick={() => onSelect(tab)}
    >
      {label}
    </button>
  );
}

function TabLoadingState({ label }: { label: string }) {
  return (
    <div className="space-y-3 py-2">
      <p className="text-sm text-base-content/60">{label}...</p>
      <div className="skeleton h-10 w-full" />
      <div className="skeleton h-10 w-full" />
      <div className="skeleton h-10 w-full" />
    </div>
  );
}
