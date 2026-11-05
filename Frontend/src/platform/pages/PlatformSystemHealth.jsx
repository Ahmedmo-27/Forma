import React, { useState, useEffect } from "react";
import {
  getSystemHealth,
  toggleMaintenanceMode,
  updatePlatformSetting,
} from "../api/platformEndpoints";
import ConfirmActionModal from "../components/ConfirmActionModal";
import toast from "react-hot-toast";

export default function PlatformSystemHealth() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    confirmLabel: "Confirm",
    confirmVariant: "primary",
    requireReason: false,
    onConfirm: null,
  });

  const loadHealth = async () => {
    try {
      setLoading(true);
      const res = await getSystemHealth();
      setHealth(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load system health");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHealth();
  }, []);

  const formatUptime = (seconds) => {
    if (!seconds) return "0s";
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${d > 0 ? `${d}d ` : ""}${h > 0 ? `${h}h ` : ""}${m}m ${s}s`;
  };

  const formatBytes = (bytes) => {
    if (!bytes) return "0 MB";
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleMaintenanceToggle = () => {
    const nextState = !health?.maintenanceMode?.enabled;
    setConfirmModal({
      isOpen: true,
      title: `${nextState ? "Enable" : "Disable"} Global Maintenance Mode`,
      message: nextState
        ? "Enabling maintenance mode will temporarily block all tenant-facing mutating operations and display a maintenance notice across all gym dashboards."
        : "Disabling maintenance mode will restore standard operations across all gyms.",
      confirmLabel: nextState ? "Enable Maintenance" : "Disable Maintenance",
      confirmVariant: nextState ? "danger" : "primary",
      requireReason: nextState,
      onConfirm: async (reason) => {
        try {
          await toggleMaintenanceMode({ enabled: nextState, reason });
          toast.success(`Maintenance mode ${nextState ? "enabled" : "disabled"}`);
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          loadHealth();
        } catch (err) {
          toast.error(err.response?.data?.message || "Maintenance toggle failed");
        }
      },
    });
  };

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">System Health & Settings</h1>
          <p className="text-sm text-slate-400 mt-1">
            Cluster metrics, database connectivity, memory pressure, and maintenance gates.
          </p>
        </div>

        <button
          onClick={loadHealth}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 self-start"
        >
          ↻ Refresh Metrics
        </button>
      </div>

      {/* Maintenance Mode Banner / Control */}
      <div
        className={`border rounded-xl p-5 shadow-xl transition-all ${
          health?.maintenanceMode?.enabled
            ? "bg-amber-950/30 border-amber-500/50"
            : "bg-slate-900 border-slate-800"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`w-3.5 h-3.5 rounded-full mt-1 ${
                health?.maintenanceMode?.enabled
                  ? "bg-amber-400 animate-ping"
                  : "bg-emerald-400"
              }`}
            />
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Global Maintenance Mode:{" "}
                <span
                  className={
                    health?.maintenanceMode?.enabled ? "text-amber-400" : "text-emerald-400"
                  }
                >
                  {health?.maintenanceMode?.enabled ? "ACTIVE" : "DISABLED"}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {health?.maintenanceMode?.enabled
                  ? `Maintenance active: "${health?.maintenanceMode?.reason || "Scheduled upgrades"}"`
                  : "All gym tenant clusters operating normally without restrictions."}
              </p>
            </div>
          </div>

          <button
            onClick={handleMaintenanceToggle}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              health?.maintenanceMode?.enabled
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30"
                : "bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30"
            }`}
          >
            {health?.maintenanceMode?.enabled ? "Resume All Gym Operations" : "Activate Maintenance Mode"}
          </button>
        </div>
      </div>

      {/* Health Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Backend Uptime</p>
          <p className="text-xl font-bold font-mono text-white mt-2">
            {formatUptime(health?.uptimeSeconds)}
          </p>
          <p className="text-xs text-slate-500 mt-1">Node {health?.nodeVersion || process?.version || "v20"}</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Database Status</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            <p className="text-xl font-bold font-mono text-emerald-400">
              {health?.database?.status || "Connected"}
            </p>
          </div>
          <p className="text-xs text-slate-500 mt-1">MongoDB Atlas Cluster</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Process Memory (Heap)</p>
          <p className="text-xl font-bold font-mono text-purple-400 mt-2">
            {formatBytes(health?.memoryUsage?.heapUsed)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Total Heap: {formatBytes(health?.memoryUsage?.heapTotal)}
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Tenants</p>
          <p className="text-xl font-bold font-mono text-white mt-2">
            {health?.activeTenantsCount || "All Ready"}
          </p>
          <p className="text-xs text-slate-500 mt-1">AsyncLocalStorage Context OK</p>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmActionModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel={confirmModal.confirmLabel}
        confirmVariant={confirmModal.confirmVariant}
        requireReason={confirmModal.requireReason}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
      />
    </div>
  );
}
