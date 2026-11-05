import { SearchIcon, XIcon, ChevronLeftIcon, ChevronRightIcon } from "./PlatformIcons";

export default function PlatformDataTable({
    columns,
    data = [],
    total = 0,
    page = 1,
    limit = 20,
    loading = false,
    onPageChange,
    onSearch,
    searchValue = "",
    searchPlaceholder = "Search...",
    filterOptions = null,
    selectedFilter = null,
    onFilterChange,
    actions = null,
}) {
    const totalPages = Math.ceil(total / limit) || 1;
    const startRecord = total > 0 ? (page - 1) * limit + 1 : 0;
    const endRecord = Math.min(page * limit, total);

    return (
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/70 shadow-xl overflow-hidden text-slate-200 backdrop-blur-md">
            {/* Table Controls Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 p-4 bg-slate-900/40">
                <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[240px] max-w-lg">
                    {onSearch && (
                        <div className="relative flex-1 min-w-[200px]">
                            <input
                                type="text"
                                value={searchValue}
                                onChange={(e) => onSearch(e.target.value)}
                                placeholder={searchPlaceholder}
                                className="w-full rounded-lg border border-slate-700/80 bg-slate-950/80 py-2 pl-9 pr-8 text-xs text-slate-100 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition"
                            />
                            <SearchIcon className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                            {searchValue && (
                                <button
                                    type="button"
                                    onClick={() => onSearch("")}
                                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200"
                                >
                                    <XIcon className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    )}

                    {filterOptions && onFilterChange && (
                        <div className="relative">
                            <select
                                value={selectedFilter || ""}
                                onChange={(e) => onFilterChange(e.target.value)}
                                className="rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition cursor-pointer"
                            >
                                {filterOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-200">
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {actions && <div className="flex items-center gap-2">{actions}</div>}
            </div>

            {/* Table Body */}
            <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-800/80 bg-slate-950/50 uppercase font-bold text-[10px] text-slate-400 tracking-wider">
                        <tr>
                            {columns.map((col) => (
                                <th key={col.key} className={`px-4 py-3.5 ${col.className || ""}`}>
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {loading ? (
                            /* Shimmer Skeleton Rows */
                            Array.from({ length: 5 }).map((_, idx) => (
                                <tr key={idx} className="animate-pulse">
                                    {columns.map((col, cIdx) => (
                                        <td key={col.key || cIdx} className="px-4 py-4">
                                            <div className="h-4 bg-slate-800/80 rounded w-3/4" />
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : data.length === 0 ? (
                            /* Clean Empty State */
                            <tr>
                                <td colSpan={columns.length} className="py-16 text-center">
                                    <div className="flex flex-col items-center justify-center">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800/60 border border-slate-700 text-slate-400">
                                            <SearchIcon className="h-6 w-6 text-slate-400" />
                                        </div>
                                        <p className="mt-3 text-sm font-semibold text-slate-300">
                                            No matching platform records
                                        </p>
                                        <p className="mt-1 text-xs text-slate-400 max-w-sm">
                                            There are no entries matching your current search or filter criteria. Try adjusting your query.
                                        </p>
                                        {(searchValue || selectedFilter) && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (onSearch) onSearch("");
                                                    if (onFilterChange) onFilterChange("");
                                                }}
                                                className="mt-4 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition"
                                            >
                                                Reset Filters
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            data.map((row, idx) => (
                                <tr
                                    key={row.id || row._id || idx}
                                    className="hover:bg-slate-800/30 transition-colors"
                                >
                                    {columns.map((col) => (
                                        <td key={col.key} className={`px-4 py-3.5 ${col.className || ""}`}>
                                            {col.render ? col.render(row) : row[col.key]}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {onPageChange && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 px-4 py-3 text-xs text-slate-400 bg-slate-950/30">
                    <div>
                        {total > 0 ? (
                            <span>
                                Showing <strong className="text-slate-200">{startRecord}</strong> to{" "}
                                <strong className="text-slate-200">{endRecord}</strong> of{" "}
                                <strong className="text-slate-200">{total}</strong> records
                            </span>
                        ) : (
                            <span>0 records</span>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => onPageChange(page - 1)}
                            disabled={page <= 1 || loading}
                            className="flex items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-800/70 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
                        >
                            <ChevronLeftIcon className="h-3.5 w-3.5" />
                            <span>Previous</span>
                        </button>

                        <span className="px-2 font-mono text-[11px] text-slate-400">
                            Page <strong className="text-slate-200">{page}</strong> of{" "}
                            <strong className="text-slate-200">{totalPages}</strong>
                        </span>

                        <button
                            type="button"
                            onClick={() => onPageChange(page + 1)}
                            disabled={page >= totalPages || loading}
                            className="flex items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-800/70 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
                        >
                            <span>Next</span>
                            <ChevronRightIcon className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
