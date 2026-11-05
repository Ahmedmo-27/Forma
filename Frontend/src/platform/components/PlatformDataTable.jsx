import { useState } from "react";

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

    return (
        <div className="rounded-xl border border-slate-800 bg-slate-900 shadow-xl overflow-hidden text-slate-200">
            {/* Table Controls Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4">
                <div className="flex items-center gap-3 flex-1 min-w-[240px] max-w-md">
                    {onSearch && (
                        <div className="relative w-full">
                            <input
                                type="text"
                                value={searchValue}
                                onChange={(e) => onSearch(e.target.value)}
                                placeholder={searchPlaceholder}
                                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                            />
                            <span className="absolute left-3 top-2.5 text-xs text-slate-500">🔍</span>
                        </div>
                    )}

                    {filterOptions && onFilterChange && (
                        <select
                            value={selectedFilter || ""}
                            onChange={(e) => onFilterChange(e.target.value)}
                            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none"
                        >
                            {filterOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    )}
                </div>

                {actions && <div className="flex items-center gap-2">{actions}</div>}
            </div>

            {/* Table Body */}
            <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-800 bg-slate-950/60 uppercase font-semibold text-slate-400 tracking-wider">
                        <tr>
                            {columns.map((col) => (
                                <th key={col.key} className={`px-4 py-3 ${col.className || ""}`}>
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                        {loading ? (
                            <tr>
                                <td colSpan={columns.length} className="py-12 text-center text-slate-500 font-medium">
                                    Loading platform data...
                                </td>
                            </tr>
                        ) : data.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="py-12 text-center text-slate-500 font-medium">
                                    No records found matching criteria.
                                </td>
                            </tr>
                        ) : (
                            data.map((row, idx) => (
                                <tr key={row.id || row._id || idx} className="hover:bg-slate-800/40 transition">
                                    {columns.map((col) => (
                                        <td key={col.key} className={`px-4 py-3 ${col.className || ""}`}>
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
                <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3 text-xs text-slate-400">
                    <div>
                        Showing <span className="font-semibold text-slate-200">{data.length}</span> of{" "}
                        <span className="font-semibold text-slate-200">{total}</span> total entries
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onPageChange(page - 1)}
                            disabled={page <= 1 || loading}
                            className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1 text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition"
                        >
                            Previous
                        </button>
                        <span>
                            Page <strong className="text-slate-200">{page}</strong> of{" "}
                            <strong className="text-slate-200">{totalPages}</strong>
                        </span>
                        <button
                            type="button"
                            onClick={() => onPageChange(page + 1)}
                            disabled={page >= totalPages || loading}
                            className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1 text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
