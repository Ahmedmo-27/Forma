import React, { useState, useEffect } from "react";
import { getCostInsights, getHealthDetails } from "../api/platformEndpoints";
import PlatformDataTable from "../components/PlatformDataTable";
import toast from "react-hot-toast";

export default function PlatformUsage() {
  const [costData, setCostData] = useState(null);
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUsage = async () => {
    try {
      setLoading(true);
      const [costRes, healthRes] = await Promise.all([
        getCostInsights(),
        getHealthDetails(),
      ]);
      setCostData(costRes.data);
      setHealthData(healthRes.data);
    } catch (err) {
      toast.error("Failed to load usage & cost data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsage();
  }, []);

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return "0 MB";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  const topStorageColumns = [
    {
      header: "Tenant",
      render: (t) => (
        <div>
          <span className="font-semibold text-white">{t.tenantName || t.name}</span>
          <p className="text-xs text-slate-400 font-mono">{t.slug || t.tenantId}</p>
        </div>
      ),
    },
    {
      header: "Plan & Cycle",
      render: (t) => (
        <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-purple-300">
          {t.planName || "Standard"} ({t.billingCycle || "Monthly"})
        </span>
      ),
    },
    {
      header: "Storage Consumed",
      render: (t) => (
        <span className="font-mono font-semibold text-amber-400">
          {formatBytes(t.storageBytes)}
        </span>
      ),
    },
    {
      header: "Fair-Use Cap",
      render: (t) => (
        <span className="text-xs text-slate-400 font-mono">
          {t.fairUseStorageBytes ? formatBytes(t.fairUseStorageBytes) : "Unlimited / N/A"}
        </span>
      ),
    },
    {
      header: "Status",
      render: (t) => {
        const exceeded = t.fairUseStorageBytes && t.storageBytes > t.fairUseStorageBytes;
        return (
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
              exceeded
                ? "bg-red-500/10 text-red-400 border border-red-500/20"
                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
            }`}
          >
            {exceeded ? "Fair-Use Exceeded" : "Within Cap"}
          </span>
        );
      },
    },
  ];

  const topWhatsAppColumns = [
    {
      header: "Tenant",
      render: (t) => (
        <div>
          <span className="font-semibold text-white">{t.tenantName || t.name}</span>
          <p className="text-xs text-slate-400 font-mono">{t.slug || t.tenantId}</p>
        </div>
      ),
    },
    {
      header: "Messages Sent (Month)",
      render: (t) => (
        <span className="font-mono font-semibold text-emerald-400">
          {(t.whatsAppCount || t.messagesSent || 0).toLocaleString()}
        </span>
      ),
    },
    {
      header: "Estimated Delivery Cost",
      render: (t) => {
        const count = t.whatsAppCount || t.messagesSent || 0;
        // e.g. ~0.05 EGP per message
        const cost = count * 0.05;
        return (
          <span className="font-mono text-slate-300 text-xs">
            ~{cost.toFixed(2)} EGP
          </span>
        );
      },
    },
    {
      header: "Fair-Use Cap",
      render: (t) => (
        <span className="text-xs text-slate-400 font-mono">
          {t.fairUseWhatsAppMonthly ? t.fairUseWhatsAppMonthly.toLocaleString() : "Uncapped"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Usage & Cost Awareness</h1>
        <p className="text-sm text-slate-400 mt-1">
          Monitor multi-tenant infrastructure consumption, high-volume WhatsApp senders, and lifetime license fair-use boundaries.
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Stored Assets</p>
          <p className="text-2xl font-bold font-mono text-white mt-2">
            {formatBytes(costData?.totalStorageBytes || 0)}
          </p>
          <p className="text-xs text-slate-500 mt-1">Member photos, documents & gym assets</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">WhatsApp Monthly Volume</p>
          <p className="text-2xl font-bold font-mono text-emerald-400 mt-2">
            {(costData?.totalWhatsAppMessages || 0).toLocaleString()}
          </p>
          <p className="text-xs text-slate-500 mt-1">Automated reminders & transactional alerts</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Lifetime Overages Flagged</p>
          <p className="text-2xl font-bold font-mono text-amber-400 mt-2">
            {costData?.lifetimeExceededCount || 0}
          </p>
          <p className="text-xs text-slate-500 mt-1">Lifetime accounts exceeding fair use</p>
        </div>
      </div>

      {/* Top Storage Consumers */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Top Storage Consumers</h2>
          <span className="text-xs text-slate-400 font-mono">Refreshed hourly</span>
        </div>
        <PlatformDataTable
          columns={topStorageColumns}
          data={costData?.topStorageConsumers || []}
          isLoading={loading}
          emptyMessage="No tenant storage records available."
        />
      </div>

      {/* High WhatsApp Volume */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Top WhatsApp Messaging Activity</h2>
          <span className="text-xs text-slate-400 font-mono">Current billing month</span>
        </div>
        <PlatformDataTable
          columns={topWhatsAppColumns}
          data={costData?.topWhatsAppSenders || []}
          isLoading={loading}
          emptyMessage="No messaging records logged this month."
        />
      </div>
    </div>
  );
}
