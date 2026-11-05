import React, { useState, useEffect } from "react";
import {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from "../api/platformEndpoints";
import PlatformDataTable from "../components/PlatformDataTable";
import ConfirmActionModal from "../components/ConfirmActionModal";
import toast from "react-hot-toast";

export default function PlatformAnnouncements() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    title: "",
    message: "",
    severity: "info",
    targetAudience: "all",
    isActive: true,
    startsAt: "",
    expiresAt: "",
  });

  const [deleteConfirm, setDeleteConfirm] = useState({
    isOpen: false,
    item: null,
  });

  const loadAnnouncements = async () => {
    try {
      setLoading(true);
      const res = await getAnnouncements();
      setAnnouncements(res.data?.announcements || res.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load announcements");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const openCreateModal = () => {
    setEditingId(null);
    setForm({
      title: "",
      message: "",
      severity: "info",
      targetAudience: "all",
      isActive: true,
      startsAt: "",
      expiresAt: "",
    });
    setShowModal(true);
  };

  const openEditModal = (a) => {
    setEditingId(a._id);
    setForm({
      title: a.title || "",
      message: a.message || "",
      severity: a.severity || "info",
      targetAudience: a.targetAudience || "all",
      isActive: a.isActive !== false,
      startsAt: a.startsAt ? a.startsAt.slice(0, 10) : "",
      expiresAt: a.expiresAt ? a.expiresAt.slice(0, 10) : "",
    });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateAnnouncement(editingId, form);
        toast.success("Announcement updated");
      } else {
        await createAnnouncement(form);
        toast.success("Announcement published");
      }
      setShowModal(false);
      loadAnnouncements();
    } catch (err) {
      toast.error(err.response?.data?.message || "Save failed");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteAnnouncement(deleteConfirm.item._id);
      toast.success("Announcement deleted");
      setDeleteConfirm({ isOpen: false, item: null });
      loadAnnouncements();
    } catch (err) {
      toast.error(err.response?.data?.message || "Delete failed");
    }
  };

  const columns = [
    {
      header: "Title & Message",
      render: (a) => (
        <div>
          <span className="font-semibold text-white">{a.title}</span>
          <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{a.message}</p>
        </div>
      ),
    },
    {
      header: "Severity",
      render: (a) => {
        const severityClasses = {
          info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
          warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
          critical: "bg-red-500/10 text-red-400 border-red-500/20",
          maintenance: "bg-purple-500/10 text-purple-400 border-purple-500/20",
        };
        return (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${severityClasses[a.severity] || ""}`}>
            {a.severity}
          </span>
        );
      },
    },
    {
      header: "Audience",
      render: (a) => (
        <span className="text-xs font-mono uppercase text-slate-300 px-2 py-0.5 rounded bg-slate-800">
          {a.targetAudience}
        </span>
      ),
    },
    {
      header: "Status",
      render: (a) => (
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            a.isActive
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : "bg-slate-700 text-slate-400 border border-slate-600"
          }`}
        >
          {a.isActive ? "Active" : "Draft / Expired"}
        </span>
      ),
    },
    {
      header: "Actions",
      align: "right",
      render: (a) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => openEditModal(a)}
            className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-500/30"
          >
            Edit
          </button>
          <button
            onClick={() => setDeleteConfirm({ isOpen: true, item: a })}
            className="px-2.5 py-1 text-xs rounded bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Platform Announcements</h1>
          <p className="text-sm text-slate-400 mt-1">
            Broadcast platform-wide updates, maintenance notices, and urgent alerts across all tenant dashboards.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/30 transition-all flex items-center gap-1.5 self-start"
        >
          <span>+ New Announcement</span>
        </button>
      </div>

      {/* Announcements Table */}
      <PlatformDataTable
        columns={columns}
        data={announcements}
        isLoading={loading}
        emptyMessage="No platform announcements broadcasted."
      />

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-2">
              {editingId ? "Edit Announcement" : "Publish Announcement"}
            </h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Headline</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Scheduled System Maintenance on Sunday 02:00 UTC"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Detailed Message</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Provide clarity on downtime duration, new features, or instructions..."
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Severity</label>
                  <select
                    value={form.severity}
                    onChange={(e) => setForm({ ...form, severity: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="info">Info (Blue)</option>
                    <option value="warning">Warning (Amber)</option>
                    <option value="critical">Critical (Red)</option>
                    <option value="maintenance">Maintenance (Purple)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Target Audience</label>
                  <select
                    value={form.targetAudience}
                    onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="all">All Gym Staff & Owners</option>
                    <option value="owners">Gym Owners Only</option>
                    <option value="staff">Staff / Receptionists Only</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="ann-active"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="rounded bg-slate-950 border-slate-800 text-purple-600 focus:ring-0"
                />
                <label htmlFor="ann-active" className="text-xs font-medium text-slate-300">
                  Active (Immediately displayed in gym tenant banners)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-500 text-white"
                >
                  {editingId ? "Update" : "Publish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmActionModal
        isOpen={deleteConfirm.isOpen}
        title="Delete Announcement"
        message={`Are you sure you want to permanently delete announcement "${deleteConfirm.item?.title}"?`}
        confirmLabel="Delete"
        confirmVariant="danger"
        requireReason={false}
        onCancel={() => setDeleteConfirm({ isOpen: false, item: null })}
        onConfirm={handleDelete}
      />
    </div>
  );
}
