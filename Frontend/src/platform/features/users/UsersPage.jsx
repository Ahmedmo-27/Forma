import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  apiGetPlatformUsers,
  apiResetUserMfa,
  apiRevokeUserSessions,
  apiDeletePlatformUser,
} from "../../lib/api/endpoints";
import { usePlatformRole } from "../../lib/auth/PermissionContext";
import {
  Button,
  Badge,
  Avatar,
  Input,
  Select,
  Pagination,
  Skeleton,
  EmptyState,
  platformToast,
} from "../../ui";
import { ConfirmDialog } from "../../shell/ConfirmDialog";
import CreatePlatformUserModal from "./CreatePlatformUserModal";
import EditPlatformUserModal from "./EditPlatformUserModal";
import {
  ShieldCheck,
  UserPlus,
  KeyRound,
  LogOut,
  Edit2,
  Trash2,
  Lock,
  Users,
  Search,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { formatDate, formatRelativeTime } from "../../lib/utils/formatters";

export default function UsersPage() {
  const { role: currentRole } = usePlatformRole();
  const isSuperAdmin = currentRole === "super_admin";

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);

  // Filters & Pagination
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Destructive Actions Targets
  const [resetMfaTarget, setResetMfaTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [executing, setExecuting] = useState(false);

  // Queries
  const {
    data: usersResponse,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["platform", "users", page, search, roleFilter, statusFilter],
    queryFn: () =>
      apiGetPlatformUsers({
        page,
        limit: 15,
        search: search.trim() || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
      }).then((r) => r.data),
  });

  const users = Array.isArray(usersResponse)
    ? usersResponse
    : usersResponse?.users || [];
  const pagination = usersResponse?.pagination || {
    total: users.length,
    page: 1,
    limit: 15,
    totalPages: 1,
  };

  // Reset MFA
  const handleResetMfaConfirm = async ({ reason }) => {
    if (!resetMfaTarget) return;
    setExecuting(true);
    try {
      const res = await apiResetUserMfa(resetMfaTarget._id, { reason });
      platformToast.success(res.data?.message || "MFA reset successfully");
      setResetMfaTarget(null);
      refetch();
    } catch (err) {
      platformToast.error(err?.message || "Failed to reset MFA");
    } finally {
      setExecuting(false);
    }
  };

  // Revoke Sessions
  const handleRevokeSessions = async (targetUser) => {
    try {
      await apiRevokeUserSessions(targetUser._id);
      platformToast.success(`Active sessions revoked for ${targetUser.email}`);
      refetch();
    } catch (err) {
      platformToast.error(err?.message || "Failed to revoke sessions");
    }
  };

  // Delete Operator
  const handleDeleteConfirm = async ({ reason }) => {
    if (!deleteTarget) return;
    setExecuting(true);
    try {
      await apiDeletePlatformUser(deleteTarget._id, { reason });
      platformToast.success(`Operator ${deleteTarget.email} removed`);
      setDeleteTarget(null);
      refetch();
    } catch (err) {
      platformToast.error(err?.message || "Failed to delete operator");
    } finally {
      setExecuting(false);
    }
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case "super_admin":
        return <Badge variant="danger" size="xs">super_admin</Badge>;
      case "billing":
        return <Badge variant="success" size="xs">billing</Badge>;
      case "support":
        return <Badge variant="info" size="xs">support</Badge>;
      case "analyst":
        return <Badge variant="warning" size="xs">analyst</Badge>;
      default:
        return <Badge variant="neutral" size="xs">{role}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--platform-text-primary)]">
              Platform Operators & Role Entitlements
            </h1>
            <Badge variant="neutral" size="sm" className="font-mono">
              RBAC Matrix
            </Badge>
          </div>
          <p className="text-xs text-[var(--platform-text-muted)] mt-1">
            Manage system administrators, security tokens, TOTP two-factor credentials, and session lifecycles.
          </p>
        </div>

        {isSuperAdmin && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreateModalOpen(true)}
          >
            <UserPlus className="w-4 h-4 mr-1.5" />
            Provision Operator
          </Button>
        )}
      </div>

      {/* KPI Metric Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Operators</span>
            <Users className="w-4 h-4 text-[var(--platform-accent)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-text-primary)]">
            {pagination.total}
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">Matching operator accounts</span>
        </div>

        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Super Admins</span>
            <Lock className="w-4 h-4 text-[var(--platform-danger)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-danger)]">
            {users.filter((u) => u.role === "super_admin").length}
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">On this page</span>
        </div>

        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>MFA Protected</span>
            <ShieldCheck className="w-4 h-4 text-[var(--platform-success)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-success)]">
            {users.filter((u) => u.mfa?.enabled).length} / {users.length}
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">On this page</span>
        </div>

        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Healthy State</span>
            <CheckCircle2 className="w-4 h-4 text-[var(--platform-info)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-text-primary)]">
            {users.filter((u) => u.status === "active").length}
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">On this page</span>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--platform-text-muted)]" />
            <Input
              placeholder="Search operators by name or email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-8"
            />
          </div>

          <Select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="w-40"
          >
            <option value="">All Roles</option>
            <option value="super_admin">Super Admin</option>
            <option value="billing">Billing Specialist</option>
            <option value="support">Support Agent</option>
            <option value="analyst">Data Analyst</option>
          </Select>

          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-36"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </Select>
        </div>

        <span className="text-xs text-[var(--platform-text-muted)] self-end sm:self-center">
          Total {pagination.total} operators
        </span>
      </div>

      {/* Operators Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No platform operators found"
          description="Provision the first system administrator to delegate platform tasks."
        />
      ) : (
        <div className="rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)] overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)] text-[var(--platform-text-muted)] font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Operator</th>
                <th className="py-3 px-4">Role Entitlement</th>
                <th className="py-3 px-4 text-center">Account Status</th>
                <th className="py-3 px-4 text-center">2FA / MFA</th>
                <th className="py-3 px-4">Enrolled Date</th>
                <th className="py-3 px-4">Last Sign-in</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--platform-border-subtle)]">
              {users.map((u) => {
                const isMfaActive = Boolean(u.mfa?.enabled);
                return (
                  <tr
                    key={u._id}
                    className="hover:bg-[var(--platform-surface-hover)] transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} size="sm" />
                        <div>
                          <div className="font-semibold text-sm text-[var(--platform-text-primary)]">
                            {u.name}
                          </div>
                          <span className="text-[11px] text-[var(--platform-text-muted)]">
                            {u.email}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono">
                      {getRoleBadge(u.role)}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <Badge
                        variant={u.status === "active" ? "success" : "neutral"}
                        size="xs"
                        className="capitalize"
                      >
                        {u.status || "active"}
                      </Badge>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <Badge
                        variant={isMfaActive ? "success" : "warning"}
                        size="xs"
                      >
                        {isMfaActive ? "Enrolled" : "Setup Required"}
                      </Badge>
                    </td>

                    <td className="py-3 px-4 text-[11px] text-[var(--platform-text-secondary)] whitespace-nowrap">
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-[11px] text-[var(--platform-text-secondary)] whitespace-nowrap">
                      {u.lastLoginAt ? formatRelativeTime(u.lastLoginAt) : "Never"}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isSuperAdmin && (
                          <>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => setEditUser(u)}
                            >
                              <Edit2 className="w-3 h-3 mr-1" />
                              Edit
                            </Button>

                            <Button
                              variant="ghost"
                              size="xs"
                              title="Reset 2FA credentials"
                              onClick={() => setResetMfaTarget(u)}
                            >
                              <KeyRound className="w-3 h-3 mr-1" />
                              Reset 2FA
                            </Button>

                            <Button
                              variant="ghost"
                              size="xs"
                              title="Revoke active sessions"
                              onClick={() => handleRevokeSessions(u)}
                            >
                              <LogOut className="w-3 h-3 mr-1" />
                              Revoke
                            </Button>

                            <Button
                              variant="ghost"
                              size="xs"
                              className="text-[var(--platform-danger)] hover:bg-[var(--platform-danger-surface)]"
                              onClick={() => setDeleteTarget(u)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex justify-end pt-2">
          <Pagination
            page={pagination.page}
            total={pagination.total}
            limit={pagination.limit || 15}
            totalPages={pagination.totalPages}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Modals */}
      <CreatePlatformUserModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSaved={refetch}
      />

      <EditPlatformUserModal
        open={Boolean(editUser)}
        onOpenChange={(open) => !open && setEditUser(null)}
        userToEdit={editUser}
        onSaved={refetch}
      />

      {/* MFA Reset Dialog */}
      <ConfirmDialog
        open={Boolean(resetMfaTarget)}
        onOpenChange={(open) => !open && setResetMfaTarget(null)}
        title={`Reset 2FA Credentials: ${resetMfaTarget?.email}`}
        description="Resetting 2FA will clear the user's TOTP secret and revoke all active sessions immediately. The user will be required to re-enroll their authenticator app on next sign in."
        confirmText="Reset 2FA & Revoke Tokens"
        variant="warning"
        requireReason={true}
        loading={executing}
        onConfirm={handleResetMfaConfirm}
      />

      {/* Delete User Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete Operator Account: ${deleteTarget?.email}`}
        description="Are you sure you want to permanently delete this platform operator? Note that the last active super_admin cannot be deleted."
        confirmText="Delete Operator Account"
        variant="danger"
        requireReason={true}
        loading={executing}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
