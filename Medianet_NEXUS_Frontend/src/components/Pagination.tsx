import { useMemo, type RefObject } from "react";
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

/**
 * Build a stable-width page window centered on `page`.
 *
 * Unlike a naive {1, last, page±1} set (whose visible count shifts as you
 * move through the range), this always tries to show `windowSize` numbered
 * pages, clamping at the edges, and adds first/last with ellipses only when
 * they fall outside the window. Result: the control doesn't visually jump
 * width as you paginate.
 *
 * Returns an array of numbers and "…" gap markers, e.g. [1, "…", 4, 5, 6, "…", 20].
 */
function buildPageItems(page: number, totalPages: number, windowSize = 5): (number | "…")[] {
  if (totalPages <= windowSize + 2) {
    // Few enough pages that everything fits — show them all, no ellipses.
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const half = Math.floor(windowSize / 2);
  let start = Math.max(1, page - half);
  let end = Math.min(totalPages, start + windowSize - 1);
  // Re-expand start if we bumped into the right edge, to keep width stable.
  start = Math.max(1, end - windowSize + 1);

  const items: (number | "…")[] = [];

  if (start > 1) {
    items.push(1);
    if (start > 2) items.push("…");
  }
  for (let p = start; p <= end; p++) items.push(p);
  if (end < totalPages) {
    if (end < totalPages - 1) items.push("…");
    items.push(totalPages);
  }

  return items;
}

export interface PaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** Options for the rows-per-page selector. Defaults to [10, 25, 50]. */
  pageSizeOptions?: readonly number[];
  /**
   * Optional element scrolled into view when the page changes — pass a ref to
   * the table/list container so users land at the top of the new page rather
   * than mid-scroll. Purely opt-in; omit it and nothing scrolls.
   */
  scrollTargetRef?: RefObject<HTMLElement | null>;
  /** How many numbered page buttons to show at once. Default 5. */
  windowSize?: number;
}

export function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  scrollTargetRef,
  windowSize = 5,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const rangeStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, totalItems);

  const items = useMemo(
    () => buildPageItems(currentPage, totalPages, windowSize),
    [currentPage, totalPages, windowSize],
  );

  function go(target: number) {
    const clamped = Math.min(Math.max(1, target), totalPages);
    if (clamped !== currentPage) {
      onPageChange(clamped);
      scrollTargetRef?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const atStart = currentPage === 1;
  const atEnd = currentPage === totalPages;

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border bg-muted/20"
    >
      <div className="flex items-center gap-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{rangeStart}–{rangeEnd}</span>
          {" "}of{" "}
          <span className="font-medium text-foreground tabular-nums">{totalItems}</span>
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Rows</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-7 w-[4.25rem] text-xs bg-background" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((n) => (
                <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-0.5">
        <button
          onClick={() => go(1)}
          disabled={atStart}
          className="size-7 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none"
          aria-label="First page"
        >
          <ChevronsLeft className="size-3.5" />
        </button>
        <button
          onClick={() => go(currentPage - 1)}
          disabled={atStart}
          className="size-7 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none"
          aria-label="Previous page"
        >
          <ChevronLeft className="size-3.5" />
        </button>

        {/* Numbered pages — hidden on narrow screens in favor of the text below */}
        <div className="hidden sm:flex items-center gap-0.5 px-1">
          {items.map((item, i) =>
            item === "…" ? (
              <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground select-none" aria-hidden="true">…</span>
            ) : (
              <button
                key={item}
                onClick={() => go(item)}
                aria-label={`Page ${item}`}
                aria-current={item === currentPage ? "page" : undefined}
                className={`min-w-7 h-7 px-1.5 rounded-md text-xs font-medium tabular-nums transition-colors ${
                  item === currentPage
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {item}
              </button>
            ),
          )}
        </div>

        {/* Compact indicator for the narrowest screens */}
        <span className="sm:hidden px-2 text-xs text-muted-foreground tabular-nums" aria-hidden="true">
          {currentPage} / {totalPages}
        </span>

        <button
          onClick={() => go(currentPage + 1)}
          disabled={atEnd}
          className="size-7 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none"
          aria-label="Next page"
        >
          <ChevronRight className="size-3.5" />
        </button>
        <button
          onClick={() => go(totalPages)}
          disabled={atEnd}
          className="size-7 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none"
          aria-label="Last page"
        >
          <ChevronsRight className="size-3.5" />
        </button>
      </div>
    </nav>
  );
}