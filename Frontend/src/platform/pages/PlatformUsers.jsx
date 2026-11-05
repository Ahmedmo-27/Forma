import React, { useState, useEffect } from "react";
import {
  getPlatformUsers,
  createPlatformUser,
  updatePlatformUser,
  deletePlatformUser,
  resetUserMfa,
  revokeUserSessions,
} from "../api/platformEndpoints";
import PlatformDataTable from "../components/PlatformDataTable";
import ConfirmActionModal from "../components/ConfirmActionModal";
import toast from "react-hot-toast";

export default function PlatformUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  const [inviteForm, setInviteForm] = useState({
    name: "",
    email: "",
    role: "support",
    password: "",
  });

  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    confirmLabel: "Confirm",
    confirmVariant: "danger",
    requireReason: false,
    onConfirm: null,
  });

  const loadUsers = async () => {
    try {
      setLoading(true);
      const res = await getPlatformUsers();
      setUsers(res.data?.users || res.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load platform users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await createPlatformUser(inviteForm);
      toast.success("Platform operator created successfully");
      setShowInviteModal(false);
      setInviteForm({ name: "", email: "", role: "support", password: "" });
      loadUsers();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to create user");
    }
  };

  const handleToggleStatus = (u) => {
    const nextStatus = u.status === "active" ? "disabled" : "active";
    setConfirmModal({
      isOpen: true,
      title: `${nextStatus === "disabled" ? "Disable" : "Enable"} Operator`,
      message: `Are you sure you want to ${nextStatus === "disabled" ? "deactivate" : "reactivate"} ${u.name}?`,
      confirmLabel: nextStatus === "disabled" ? "Deactivate" : "Activate",
      confirmVariant: nextStatus === "disabled" ? "danger" : "primary",
      requireReason: false,
      onConfirm: async () => {
        try {
          await updatePlatformUser(u._id, { status: nextStatus });
          toast.success(`User marked as ${nextStatus}`);
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          loadUsers();
        } catch (err) {
          toast.error(err.response?.data?.message || "Status update failed");
        }
      },
    });
  };

  const handleResetMfa = (u) => {
    setConfirmModal({
      isOpen: true,
      title: `Reset MFA for ${u.name}`,
      message: "This will wipe the operator's TOTP secret and recovery codes, forcing fresh MFA setup on next login.",
      confirmLabel: "Reset MFA",
      confirmVariant: "danger",
      requireReason: true,
      onConfirm: async (reason) => {
        try {
          await resetUserMfa(u._id, { reason });
          toast.success("MFA reset successfully");
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          loadUsers();
        } catch (err) {
          toast.error(err.response?.data?.message || "MFA reset failed");
        }
      },
    });
  };

  const handleRevokeSessions = (u) => {
    setConfirmModal({
      isOpen: true,
      title: `Revoke All Sessions for ${u.name}`,
      message: "This immediately invalidates all active JWT refresh tokens for this operator.",
      confirmLabel: "Revoke All",
      confirmVariant: "danger",
      requireReason: false,
      onConfirm: async () => {
        try {
          await revokeUserSessions(u._id);
          toast.success("Sessions revoked");
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          loadUsers();
        } catch (err) {
          toast.error(err.response?.data?.message || "Revoke failed");
        }
      },
    });
  };

  const columns = [
    {
      header: "Operator",
      render: (u) => (
        <div>
          <span className="font-semibold text-white">{u.name}</span>
          <p className="text-xs text-slate-400 font-mono">{u.email}</p>
        </div>
      ),
    },
    {
      header: "Role",
      render: (u) => {
        const roleColors = {
          super_admin: "bg-purple-500/10 text-purple-300 border-purple-500/20",
          billing: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
          support: "bg-blue-500/10 text-blue-300 border-blue-500/20",
          analyst: "bg-amber-500/10 text-amber-300 border-amber-500/20",
        };
        return (
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-medium border ${roleColors[u.role] || ""}`}>
            {u.role}
          </span>
        );
      },
    },
    {
      header: "MFA Enrollment",
      render: (u) => (
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            u.mfa?.enabled
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
          }`}
        >
          {u.mfa?.enabled ? "Enrolled (TOTP)" : "Pending Setup"}
        </span>
      ),
    },
    {
      header: "Status",
      render: (u) => (
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            u.status === "active"
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : "bg-red-500/10 text-red-400 border border-red-500/20"
          }`}
        >
          {u.status}
        </span>
      ),
    },
    {
      header: "Last Login",
      render: (u) => (
        <span className="text-xs text-slate-400">
          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}
        </span>
      ),
    },
    {
      header: "Actions",
      align: "right",
      render: (u) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => handleResetMfa(u)}
            className="px-2 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30"
            title="Reset MFA"
          >
            Reset MFA
          </button>
          <button
            onClick={() => handleRevokeSessions(u)}
            className="px-2 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            title="Revoke Sessions"
          >
            Revoke
          </button>
          <button
            onClick={() => handleToggleStatus(u)}
            className={`px-2 py-1 text-xs rounded border ${
              u.status === "active"
                ? "bg-red-600/20 hover:bg-red-600/30 text-red-300 border-red-500/30"
                : "bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/30"
            }`}
          >
            {u.status === "active" ? "Disable" : "Enable"}
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
          <h1 className="text-2xl font-bold text-white tracking-tight">Platform Operators & Roles</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage administrative team members, role assignments, MFA states, and security session invalidation.
          </p>
        </div>

        <button
          onClick={() => setShowInviteModal(true)}
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/30 transition-all flex items-center gap-1.5 self-start"
        >
          <span>+ Add Platform User</span>
        </button>
      </div>

      {/* Users Table */}
      <PlatformDataTable
        columns={columns}
        data={users}
        isLoading={loading}
        emptyMessage="No platform users found."
      />

      {/* Create Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-2">Create Platform Operator</h3>
            <p className="text-xs text-slate-400 mb-4">
              All platform operators are required to configure TOTP-based Multi-Factor Authentication on initial sign-in.
            </p>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sarah Jenkins"
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="operator@gymleap.com"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Temporary Password</label>
                <input
                  type="password"
                  required
                  placeholder="Min 8 characters"
                  value={inviteForm.password}
                  onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Assigned Role</label>
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="super_admin">Super Admin (Unrestricted platform access)</option>
                  <option value="billing">Billing (Ledger, manual payments, invoices, refunds)</option>
                  <option value="support">Support (Tenant diagnostics, read-only impersonation, notes)</option>
                  <option value="analyst">Analyst (Read-only analytics & reporting)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-500 text-white"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
