import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  apiGetAnnouncements,
  apiDeleteAnnouncement,
  apiUpdateAnnouncement,
} from "../../lib/api/endpoints";
import {
  Button,
  Badge,
  Pagination,
  Skeleton,
  EmptyState,
  platformToast,
} from "../../ui";
import { ConfirmDialog } from "../../shell/ConfirmDialog";
import CreateAnnouncementModal from "./CreateAnnouncementModal";
import {
  Megaphone,
  Plus,
  AlertCircle,
  Info,
  CheckCircle,
  AlertTriangle,
  Calendar,
  Users,
  Edit2,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { formatDate, formatRelativeTime } from "../../lib/utils/formatters";

export default function AnnouncementsPage() {
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const {
    data: announcementsResponse,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["platform", "announcements", page],
    queryFn: () =>
      apiGetAnnouncements({
        page,
        limit: 10,
      }).then((r) => r.data),
  });

  const announcements = Array.isArray(announcementsResponse)
    ? announcementsResponse
    : announcementsResponse?.announcements || [];
  const pagination = announcementsResponse?.pagination || {
    total: announcements.length,
    page: 1,
    limit: 10,
    totalPages: 1,
  };

  const handleToggleActive = async (ann) => {
    try {
      await apiUpdateAnnouncement(ann._id, { isActive: !ann.isActive });
      platformToast.success(
        `Announcement ${!ann.isActive ? "activated" : "deactivated"}`
      );
      refetch();
    } catch (err) {
      platformToast.error(err?.message || "Failed to toggle status");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDeleteAnnouncement(deleteTarget._id);
      platformToast.success("Announcement broadcast deleted");
      setDeleteTarget(null);
      refetch();
    } catch (err) {
      platformToast.error(err?.message || "Failed to delete announcement");
    } finally {
      setDeleting(false);
    }
  };

  const getSeverityBadge = (type) => {
    switch (type) {
      case "critical":
        return <Badge variant="danger" size="xs">Critical Alert</Badge>;
      case "warning":
        return <Badge variant="warning" size="xs">Warning</Badge>;
      case "success":
        return <Badge variant="success" size="xs">Release</Badge>;
      default:
        return <Badge variant="info" size="xs">Info</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--platform-text-primary)]">
              Platform Broadcasts & Announcements
            </h1>
            <Badge variant="neutral" size="sm" className="font-mono">
              Dashboard In-App
            </Badge>
          </div>
          <p className="text-xs text-[var(--platform-text-muted)] mt-1">
            Dispatch maintenance alerts, version releases, and critical notices to tenant gym admin consoles.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setEditTarget(null);
            setModalOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Publish Broadcast
        </Button>
      </div>

      {/* KPI Metric Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Total Broadcasts</span>
            <Megaphone className="w-4 h-4 text-[var(--platform-accent)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-text-primary)]">
            {announcements.length}
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">Historical announcements</span>
        </div>

        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Active Today</span>
            <CheckCircle className="w-4 h-4 text-[var(--platform-success)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-success)]">
            {announcements.filter((a) => a.isActive).length}
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">Currently visible in apps</span>
        </div>

        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Critical Incidents</span>
            <AlertTriangle className="w-4 h-4 text-[var(--platform-danger)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-danger)]">
            {announcements.filter((a) => a.type === "critical" && a.isActive).length}
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">High priority notices</span>
        </div>

        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Target Audience</span>
            <Users className="w-4 h-4 text-[var(--platform-info)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-text-primary)]">
            All Gyms
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">Broad coverage</span>
        </div>
      </div>

      {/* Broadcasts Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No broadcasts published"
          description="Create your first announcement to communicate system maintenance or feature updates to gym subscribers."
          action={
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setEditTarget(null);
                setModalOpen(true);
              }}
            >
              Publish Broadcast
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)] overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)] text-[var(--platform-text-muted)] font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Headline & Content</th>
                <th className="py-3 px-4">Severity</th>
                <th className="py-3 px-4">Audience</th>
                <th className="py-3 px-4">Schedule Window</th>
                <th className="py-3 px-4 text-center">Active Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--platform-border-subtle)]">
              {announcements.map((ann) => (
                <tr
                  key={ann._id}
                  className="hover:bg-[var(--platform-surface-hover)] transition-colors"
                >
                  <td className="py-3 px-4 max-w-md">
                    <div className="font-semibold text-sm text-[var(--platform-text-primary)]">
                      {ann.title}
                    </div>
                    <p className="text-xs text-[var(--platform-text-secondary)] line-clamp-2 mt-0.5">
                      {ann.message}
                    </p>
                  </td>

                  <td className="py-3 px-4">
                    {getSeverityBadge(ann.type)}
                  </td>

                  <td className="py-3 px-4">
                    <Badge variant="neutral" size="xs" className="capitalize">
                      {ann.target?.type || "all"}
                    </Badge>
                  </td>

                  <td className="py-3 px-4 text-[11px] text-[var(--platform-text-secondary)] whitespace-nowrap">
                    <div>{formatDate(ann.startDate)}</div>
                    {ann.endDate ? (
                      <span className="text-[10px] text-[var(--platform-text-muted)]">
                        Until {formatDate(ann.endDate)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-[var(--platform-text-muted)]">
                        Indefinite
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(ann)}
                      aria-label={ann.isActive ? "Deactivate announcement" : "Activate announcement"}
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                        ann.isActive
                          ? "bg-[var(--platform-success-surface)] text-[var(--platform-success)] border border-[var(--platform-success-border)]"
                          : "bg-[var(--platform-neutral-surface)] text-[var(--platform-text-muted)] border border-[var(--platform-border-subtle)]"
                      }`}
                    >
                      {ann.isActive ? (
                        <>
                          <Check className="w-3 h-3" />
                          Live
                        </>
                      ) : (
                        <>
                          <X className="w-3 h-3" />
                          Hidden
                        </>
                      )}
                    </button>
                  </td>

                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          setEditTarget(ann);
                          setModalOpen(true);
                        }}
                      >
                        <Edit2 className="w-3 h-3 mr-1" />
                        Edit
                      </Button>

                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-[var(--platform-danger)] hover:bg-[var(--platform-danger-surface)]"
                        onClick={() => setDeleteTarget(ann)}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex justify-end pt-2">
          <Pagination
            page={pagination.page}
            total={pagination.total}
            limit={pagination.limit || 10}
            totalPages={pagination.totalPages}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Create / Edit Modal */}
      <CreateAnnouncementModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        announcementToEdit={editTarget}
        onSaved={refetch}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Announcement Broadcast"
        description={`Are you sure you want to delete broadcast "${deleteTarget?.title}"? This cannot be undone.`}
        confirmText="Delete Broadcast"
        variant="danger"
        requireReason={false}
        loading={deleting}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
