import React, { useState, useEffect } from "react";
import { getPlatformAuditLogs } from "../api/platformEndpoints";
import PlatformDataTable from "../components/PlatformDataTable";
import toast from "react-hot-toast";

export default function PlatformAuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    action: "",
    tenantId: "",
    page: 1,
    limit: 25,
  });

  const loadAuditLogs = async () => {
    try {
      setLoading(true);
      const res = await getPlatformAuditLogs(filters);
      setLogs(res.data?.logs || res.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuditLogs();
  }, [filters]);

  const columns = [
    {
      header: "Timestamp",
      render: (l) => (
        <span className="text-xs font-mono text-slate-400">
          {new Date(l.createdAt || l.timestamp).toLocaleString()}
        </span>
      ),
    },
    {
      header: "Action",
      render: (l) => (
        <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
          {l.action}
        </span>
      ),
    },
    {
      header: "Operator",
      render: (l) => (
        <div>
          <span className="text-xs font-semibold text-white">{l.actorName || l.actorId?.name || "Platform Admin"}</span>
          <p className="text-xs text-slate-400 font-mono">{l.actorEmail || l.actorId?.email || ""}</p>
        </div>
      ),
    },
    {
      header: "Target Tenant",
      render: (l) => (
        <span className="text-xs font-mono text-slate-300">
          {l.tenantSlug || l.tenantId?.name || l.tenantId || "Global / System"}
        </span>
      ),
    },
    {
      header: "Mandatory Reason",
      render: (l) => (
        <span className="text-xs text-slate-300 italic max-w-xs block truncate" title={l.reason}>
          "{l.reason || "N/A"}"
        </span>
      ),
    },
    {
      header: "Origin IP",
      render: (l) => (
        <span className="text-xs font-mono text-slate-500">
          {l.ipAddress || l.ip || "127.0.0.1"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Security & Operations Audit Trail</h1>
        <p className="text-sm text-slate-400 mt-1">
          Cryptographically recorded log of all destructive, financial, and lifecycle mutations executed across the platform.
        </p>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-900 border border-slate-800 p-3 rounded-xl">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search action (e.g. tenant.suspend, payment.confirm)..."
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value, page: 1 })}
            className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-purple-500"
          />
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

      {/* Audit Log Table */}
      <PlatformDataTable
        columns={columns}
        data={logs}
        isLoading={loading}
        emptyMessage="No audit log entries recorded yet."
      />
    </div>
  );
}
