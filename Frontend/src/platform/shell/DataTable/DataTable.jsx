import { useId, useState } from "react";
import {
  Search,
  SlidersHorizontal,
  Download,
  X,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";
import { TableRowSkeleton } from "../../ui/Skeleton";
import { EmptyState } from "../../ui/EmptyState";
import { Pagination } from "../../ui/Pagination";
import { Checkbox } from "../../ui/Checkbox";
import { Button } from "../../ui/Button";
import { Popover } from "../../ui/Popover";
import { cn } from "../../lib/utils/cn";

export function DataTable({
  columns = [], // [{ key, header, render, sortable, align: 'left'|'right'|'center', width, isMono }]
  data = [],
  total = 0,
  page = 1,
  limit = 20,
  loading = false,
  error: _error = null,
  onPageChange,
  onSearch,
  searchValue = "",
  searchPlaceholder = "Search records...",
  sortBy,
  sortOrder, // 'asc' | 'desc'
  onSort,
  filters = [], // [{ key, label, value, options: [{ value, label }], onChange }]
  selectedIds = [],
  onSelectChange, // (newSelectedIds) => void
  bulkActions, // ({ selectedIds, clearSelection }) => ReactNode
  onExportCsv,
  emptyTitle = "No records found",
  emptyDescription = "There are no entries matching your current filters.",
  className = "",
}) {
  const searchId = useId();
  const [visibleColumns, setVisibleColumns] = useState(() =>
    columns.reduce((acc, col) => ({ ...acc, [col.key]: true }), {})
  );

  const activeColumns = columns.filter((col) => visibleColumns[col.key] !== false);

  const isAllSelected =
    data.length > 0 && data.every((row) => selectedIds.includes(row.id || row._id));
  const isPartiallySelected =
    selectedIds.length > 0 && !isAllSelected;

  const handleSelectAll = (checked) => {
    if (checked) {
      const allRowIds = data.map((r) => r.id || r._id).filter(Boolean);
      const union = Array.from(new Set([...selectedIds, ...allRowIds]));
      onSelectChange?.(union);
    } else {
      const currentRowIds = new Set(data.map((r) => r.id || r._id));
      const remaining = selectedIds.filter((id) => !currentRowIds.has(id));
      onSelectChange?.(remaining);
    }
  };

  const handleSelectRow = (rowId, checked) => {
    if (checked) {
      onSelectChange?.([...selectedIds, rowId]);
    } else {
      onSelectChange?.(selectedIds.filter((id) => id !== rowId));
    }
  };

  const handleColumnSort = (colKey) => {
    if (!onSort) return;
    if (sortBy === colKey) {
      onSort(colKey, sortOrder === "asc" ? "desc" : "asc");
    } else {
      onSort(colKey, "asc");
    }
  };

  return (
    <div
      className={cn(
        "rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] overflow-hidden shadow-2xs text-left",
        className
      )}
    >
      {/* Top Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-b border-[var(--platform-border-subtle)] bg-[var(--platform-surface-subtle)]/40">
        <div className="flex flex-wrap items-center gap-2 flex-1 w-full sm:w-auto">
          {/* Search Box */}
          {onSearch && (
            <div className="flex items-center gap-2 flex-1 w-full sm:w-auto sm:min-w-[200px] max-w-md">
              <label htmlFor={searchId} className="text-xs font-medium text-[var(--platform-text-secondary)] shrink-0">
                Search
              </label>
              <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--platform-text-muted)] pointer-events-none" aria-hidden="true" />
              <input
                id={searchId}
                type="search"
                value={searchValue}
                onChange={(e) => onSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full h-9 pl-8 pr-8 text-xs rounded-[var(--platform-radius-md)] bg-[var(--platform-surface)] border border-[var(--platform-border-strong)] text-[var(--platform-text-primary)] placeholder-[var(--platform-text-muted)] outline-none focus:border-[var(--platform-accent)]"
              />
              {searchValue && (
                <button
                  type="button"
                  onClick={() => onSearch("")}
                  aria-label="Clear search"
                  className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-w-6 min-h-6 text-[var(--platform-text-muted)] hover:text-[var(--platform-text-primary)] cursor-pointer rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              </div>
            </div>
          )}

          {/* Filter Dropdowns */}
          {filters.map((filter) => (
            <div key={filter.key} className="flex items-center">
              <select
                value={filter.value || ""}
                aria-label={filter.label}
                onChange={(e) => filter.onChange(e.target.value)}
                className="h-9 px-2 text-xs rounded-[var(--platform-radius-md)] bg-[var(--platform-surface)] border border-[var(--platform-border-strong)] text-[var(--platform-text-primary)] outline-none cursor-pointer"
              >
                <option value="">{filter.label}: All</option>
                {filter.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {/* Right Toolbar Actions */}
        <div className="flex items-center gap-2">
          {/* Column Visibility */}
          <Popover
            align="end"
            trigger={
              <Button size="xs" variant="outline" leftIcon={SlidersHorizontal}>
                Columns
              </Button>
            }
            content={
              <div className="w-44 space-y-2 p-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] pb-1 border-b border-[var(--platform-border-subtle)]">
                  Toggle Columns
                </div>
                {columns.filter((col) => col.key !== "actions" && col.header).map((col) => (
                  <Checkbox
                    key={col.key}
                    label={col.header}
                    checked={visibleColumns[col.key] !== false}
                    onChange={(checked) =>
                      setVisibleColumns((prev) => ({ ...prev, [col.key]: checked }))
                    }
                  />
                ))}
              </div>
            }
          />

          {/* Export CSV */}
          {onExportCsv && (
            <Button size="xs" variant="outline" leftIcon={Download} onClick={onExportCsv}>
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {/* Bulk Action Bar (when rows are checked) */}
      {selectedIds.length > 0 && bulkActions && (
        <div className="flex items-center justify-between px-4 py-2 bg-[var(--platform-accent-subtle)] border-b border-[var(--platform-accent)]/20 text-xs">
          <div className="flex items-center gap-2 text-[var(--platform-accent)] font-medium">
            <span className="platform-mono font-bold">{selectedIds.length}</span> rows selected
          </div>
          <div className="flex items-center gap-2">
            {bulkActions({
              selectedIds,
              clearSelection: () => onSelectChange?.([]),
            })}
            <Button
              size="xs"
              variant="ghost"
              onClick={() => onSelectChange?.([])}
              className="text-[var(--platform-accent)] hover:bg-[var(--platform-accent)]/10"
            >
              Clear selection
            </Button>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="overflow-x-auto overflow-y-hidden">
        <table className="w-full text-left border-collapse" style={{ fontSize: "var(--platform-table-font-size)" }}>
          <thead className="sticky top-0 z-10 bg-[var(--platform-surface-subtle)] text-[var(--platform-text-muted)] uppercase text-[11px] font-bold tracking-wider border-b border-[var(--platform-border)] select-none">
            <tr>
              {onSelectChange && (
                <th scope="col" className="w-10 py-2.5 px-3">
                  <Checkbox
                    checked={isAllSelected}
                    indeterminate={isPartiallySelected}
                    onChange={handleSelectAll}
                    aria-label="Select all rows on this page"
                  />
                </th>
              )}
              {activeColumns.map((col) => {
                const isSorted = sortBy === col.key;
                const sortDirection = isSorted ? (sortOrder === "asc" ? "ascending" : "descending") : "none";
                return (
                  <th
                    key={col.key}
                    scope="col"
                    style={{ width: col.width }}
                    onClick={() => col.sortable && handleColumnSort(col.key)}
                    onKeyDown={(e) => {
                      if (col.sortable && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        handleColumnSort(col.key);
                      }
                    }}
                    tabIndex={col.sortable ? 0 : undefined}
                    aria-sort={col.sortable ? sortDirection : undefined}
                    className={cn(
                      "py-2.5 px-3 font-semibold transition-colors outline-none",
                      col.sortable && "cursor-pointer hover:text-[var(--platform-text-primary)] focus-visible:bg-[var(--platform-surface)] focus-visible:ring-1 focus-visible:ring-[var(--platform-accent)]",
                      col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                    )}
                  >
                    <div className={cn("inline-flex items-center gap-1", col.align === "right" && "flex-row-reverse")}>
                      <span>{col.header}</span>
                      {col.sortable && (
                        <span className="text-[var(--platform-text-muted)]">
                          {isSorted ? (
                            sortOrder === "asc" ? (
                              <ChevronUp className="w-3.5 h-3.5 text-[var(--platform-accent)]" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-[var(--platform-accent)]" />
                            )
                          ) : (
                            <ChevronsUpDown className="w-3 h-3 opacity-40 hover:opacity-100" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--platform-border-subtle)] text-[var(--platform-text-primary)]">
            {loading ? (
              <TableRowSkeleton columns={activeColumns.length + (onSelectChange ? 1 : 0)} />
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={activeColumns.length + (onSelectChange ? 1 : 0)}>
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : (
              data.map((row, rIdx) => {
                const rowId = row.id || row._id || rIdx;
                const isSelected = selectedIds.includes(rowId);

                return (
                  <tr
                    key={rowId}
                    className={cn(
                      "transition-colors hover:bg-[var(--platform-surface-subtle)]/60 group",
                      isSelected && "bg-[var(--platform-accent-subtle)]/40"
                    )}
                  >
                    {onSelectChange && (
                      <td className="w-8 py-2.5 px-3">
                        <Checkbox
                          checked={isSelected}
                          onChange={(checked) => handleSelectRow(rowId, checked)}
                          aria-label={`Select row ${rIdx + 1}`}
                        />
                      </td>
                    )}
                    {activeColumns.map((col) => {
                      const value = row[col.key];
                      const rendered = col.render ? col.render(row, value) : value;

                      return (
                        <td
                          key={col.key}
                          style={{
                            paddingTop: "var(--platform-cell-py)",
                            paddingBottom: "var(--platform-cell-py)",
                            paddingLeft: "var(--platform-cell-px)",
                            paddingRight: "var(--platform-cell-px)",
                          }}
                          className={cn(
                            col.align === "right" && "text-right platform-mono",
                            col.align === "center" && "text-center",
                            col.isMono && "platform-mono text-[11px]"
                          )}
                        >
                          {rendered ?? "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {onPageChange && (
        <div className="p-3 border-t border-[var(--platform-border-subtle)] bg-[var(--platform-surface-subtle)]/20">
          <Pagination
            page={page}
            total={total}
            limit={limit}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </div>
  );
}
