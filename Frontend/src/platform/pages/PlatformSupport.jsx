import React, { useState } from "react";
import {
  createImpersonationSession,
  exportTenantData,
} from "../api/platformEndpoints";
import { usePlatformAuth } from "../context/PlatformAuthContext";
import toast from "react-hot-toast";

export default function PlatformSupport() {
  const { user } = usePlatformAuth();
  const isSuperAdmin = user?.role === "super_admin";

  const [impersonateForm, setImpersonateForm] = useState({
    tenantId: "",
    mode: "read_only",
    reason: "",
  });
  const [impersonateLoading, setImpersonateLoading] = useState(false);

  const [exportTenantId, setExportTenantId] = useState("");
  const [exportLoading, setExportLoading] = useState(false);

  const handleLaunchImpersonation = async (e) => {
    e.preventDefault();
    if (!impersonateForm.tenantId.trim()) {
      return toast.error("Please enter a Tenant ID or Slug");
    }
    if (!impersonateForm.reason.trim()) {
      return toast.error("Audit reason is strictly mandatory for impersonation");
    }
    if (impersonateForm.mode === "read_write" && !isSuperAdmin) {
      return toast.error("Only super_admin role can initiate read-write impersonation");
    }

    try {
      setImpersonateLoading(true);
      const res = await createImpersonationSession(impersonateForm);
      const { token, tenant } = res.data;
      toast.success(`Impersonation session created for ${tenant?.name || "tenant"}`);

      // Open new tab with the tenant interface passing impersonation token
      const tenantUrl = `/?impersonation_token=${encodeURIComponent(token)}`;
      window.open(tenantUrl, "_blank");

      // Reset reason
      setImpersonateForm((prev) => ({ ...prev, reason: "" }));
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to start impersonation");
    } finally {
      setImpersonateLoading(false);
    }
  };

  const handleExportData = async (e) => {
    e.preventDefault();
    if (!exportTenantId.trim()) {
      return toast.error("Please enter a Tenant ID");
    }

    try {
      setExportLoading(true);
      const res = await exportTenantData(exportTenantId.trim());
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `tenant-export-${exportTenantId.trim()}-${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      toast.success("Tenant archive exported and downloaded");
      setExportTenantId("");
    } catch (err) {
      toast.error(err.response?.data?.message || "Export failed");
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Support Operations & Impersonation</h1>
        <p className="text-sm text-slate-400 mt-1">
          Secure, time-limited tenant troubleshooting, audited "View As" sessions, and complete data export.
        </p>
      </div>

      {/* Impersonation Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
              Impersonate Tenant ("View As")
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Issues a 30-minute tenant token tagged with your operator ID. Any mutating request is blocked if launched in Read-Only mode.
            </p>
          </div>
          <span className="px-2.5 py-1 text-xs font-mono font-medium rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
            Audited & Tagged
          </span>
        </div>

        <form onSubmit={handleLaunchImpersonation} className="mt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Tenant ID or Slug <span className="text-amber-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. titan-fitness or 65a7f..."
                value={impersonateForm.tenantId}
                onChange={(e) => setImpersonateForm({ ...impersonateForm, tenantId: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Session Mode</label>
              <select
                value={impersonateForm.mode}
                onChange={(e) => setImpersonateForm({ ...impersonateForm, mode: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
              >
                <option value="read_only">Read-Only (Default - Safe inspection)</option>
                <option value="read_write" disabled={!isSuperAdmin}>
                  Read-Write {isSuperAdmin ? "(Super Admin Only)" : "(Requires Super Admin)"}
                </option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Mandatory Support Reason <span className="text-amber-400">*</span>
            </label>
            <textarea
              required
              rows={2}
              placeholder="e.g., Ticket #4921: Investigating member check-in QR issue on iPad"
              value={impersonateForm.reason}
              onChange={(e) => setImpersonateForm({ ...impersonateForm, reason: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={impersonateLoading}
              className="px-5 py-2.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/30 transition-all flex items-center gap-2"
            >
              {impersonateLoading ? "Launching..." : "Launch Impersonated Session →"}
            </button>
          </div>
        </form>
      </div>

      {/* Data Export Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
        <h2 className="text-lg font-bold text-white">Full Tenant Data Export</h2>
        <p className="text-xs text-slate-400 mt-1">
          Export all member profiles, subscriptions, check-in history, invoices, and settings as a portable JSON archive.
        </p>

        <form onSubmit={handleExportData} className="mt-6 flex flex-col sm:flex-row items-center gap-3">
          <input
            type="text"
            required
            placeholder="Tenant ID (e.g. 65a7f...)"
            value={exportTenantId}
            onChange={(e) => setExportTenantId(e.target.value)}
            className="flex-1 w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500 font-mono"
          />

          <button
            type="submit"
            disabled={exportLoading}
            className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition-all flex items-center justify-center gap-2"
          >
            {exportLoading ? "Exporting..." : "⬇ Export JSON Archive"}
          </button>
        </form>
      </div>
    </div>
  );
}
