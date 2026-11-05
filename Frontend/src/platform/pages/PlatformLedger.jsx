import React, { useState, useEffect } from "react";
import { getLedger, exportLedgerCsvUrl } from "../api/platformEndpoints";
import PlatformDataTable from "../components/PlatformDataTable";
import toast from "react-hot-toast";

export default function PlatformLedger() {
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    eventType: "",
    tenantId: "",
    page: 1,
    limit: 20,
  });

  const loadLedger = async () => {
    try {
      setLoading(true);
      const res = await getLedger(filters);
      setEvents(res.data?.events || res.data || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load ledger events");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLedger();
  }, [filters]);

  const handleExportCsv = () => {
    const query = new URLSearchParams({
      eventType: filters.eventType || "",
      tenantId: filters.tenantId || "",
    }).toString();
    window.open(`${exportLedgerCsvUrl}?${query}`, "_blank");
  };

  const columns = [
    {
      header: "Timestamp",
      render: (e) => (
        <span className="text-xs font-mono text-slate-400">
          {new Date(e.createdAt || e.timestamp).toLocaleString()}
        </span>
      ),
    },
    {
      header: "Event Type",
      render: (e) => {
        const typeColors = {
          purchase: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
          renewal: "bg-blue-500/10 text-blue-400 border-blue-500/20",
          upgrade: "bg-purple-500/10 text-purple-400 border-purple-500/20",
          downgrade: "bg-orange-500/10 text-orange-400 border-orange-500/20",
          refund: "bg-red-500/10 text-red-400 border-red-500/20",
          cancellation: "bg-slate-700 text-slate-300 border-slate-600",
          price_change: "bg-pink-500/10 text-pink-400 border-pink-500/20",
        };
        const colorClass = typeColors[e.eventType] || "bg-slate-800 text-slate-400 border-slate-700";
        return (
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-medium border ${colorClass}`}>
            {e.eventType}
          </span>
        );
      },
    },
    {
      header: "Tenant",
      render: (e) => (
        <div>
          <span className="font-semibold text-white">{e.tenantId?.name || e.tenantName || e.tenantId}</span>
          <p className="text-xs text-slate-400 font-mono">{e.tenantId?.slug || ""}</p>
        </div>
      ),
    },
    {
      header: "Amount",
      render: (e) => (
        <span
          className={`font-mono font-semibold ${
            e.eventType === "refund" ? "text-red-400" : "text-emerald-400"
          }`}
        >
          {e.eventType === "refund" ? "-" : "+"}
          {Math.abs(e.amount || 0).toLocaleString()} {e.currency || "EGP"}
        </span>
      ),
    },
    {
      header: "Actor",
      render: (e) => (
        <div>
          <span className="text-xs text-slate-300">{e.actorName || e.actorId?.name || "System"}</span>
          <p className="text-xs text-slate-500 font-mono">{e.actorRole || ""}</p>
        </div>
      ),
    },
    {
      header: "Reason / Details",
      render: (e) => (
        <span className="text-xs text-slate-400 max-w-xs truncate block" title={e.reason || e.notes}>
          {e.reason || e.notes || "-"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Billing Ledger</h1>
          <p className="text-sm text-slate-400 mt-1">
            Immutable, append-only financial and licensing event audit trail.
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition-all flex items-center gap-2 self-start"
        >
          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-900 border border-slate-800 p-3 rounded-xl">
        <div>
          <select
            value={filters.eventType}
            onChange={(e) => setFilters({ ...filters, eventType: e.target.value, page: 1 })}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-purple-500"
          >
            <option value="">All Event Types</option>
            <option value="purchase">Purchase</option>
            <option value="renewal">Renewal</option>
            <option value="upgrade">Upgrade</option>
            <option value="downgrade">Downgrade</option>
            <option value="refund">Refund</option>
            <option value="cancellation">Cancellation</option>
            <option value="price_change">Price Change</option>
          </select>
        </div>

        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Filter by Tenant ID..."
            value={filters.tenantId}
            onChange={(e) => setFilters({ ...filters, tenantId: e.target.value, page: 1 })}
            className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-purple-500"
          />
        </div>
      </div>

      {/* Ledger Table */}
      <PlatformDataTable
        columns={columns}
        data={events}
        isLoading={loading}
        emptyMessage="No ledger events found matching the criteria."
      />
    </div>
  );
}
