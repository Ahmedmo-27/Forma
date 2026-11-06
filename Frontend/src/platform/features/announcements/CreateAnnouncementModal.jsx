import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  Button,
  Input,
  Textarea,
  Select,
  Switch,
  Checkbox,
  Callout,
  platformToast,
} from "../../ui";
import {
  apiCreateAnnouncement,
  apiUpdateAnnouncement,
  apiGetPlans,
  apiGetTenants,
} from "../../lib/api/endpoints";

export default function CreateAnnouncementModal({
  open,
  onOpenChange,
  announcementToEdit = null,
  onSaved,
}) {
  const isEdit = Boolean(announcementToEdit);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("info");
  const [targetType, setTargetType] = useState("all");
  const [selectedPlanKeys, setSelectedPlanKeys] = useState([]);
  const [selectedTenantIds, setSelectedTenantIds] = useState([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (announcementToEdit) {
      setTitle(announcementToEdit.title || "");
      setMessage(announcementToEdit.message || "");
      setType(announcementToEdit.type || "info");
      setTargetType(announcementToEdit.target?.type || "all");
      setSelectedPlanKeys(announcementToEdit.target?.targetPlanKeys || []);
      setSelectedTenantIds(
        (announcementToEdit.target?.targetTenantIds || []).map((id) =>
          typeof id === "object" ? String(id._id || id) : String(id)
        )
      );
      setStartDate(
        announcementToEdit.startDate
          ? new Date(announcementToEdit.startDate).toISOString().split("T")[0]
          : ""
      );
      setEndDate(
        announcementToEdit.endDate
          ? new Date(announcementToEdit.endDate).toISOString().split("T")[0]
          : ""
      );
      setIsActive(announcementToEdit.isActive !== false);
    } else {
      setTitle("");
      setMessage("");
      setType("info");
      setTargetType("all");
      setSelectedPlanKeys([]);
      setSelectedTenantIds([]);
      setStartDate(new Date().toISOString().split("T")[0]);
      setEndDate("");
      setIsActive(true);
    }
  }, [announcementToEdit, open]);

  const { data: plans = [] } = useQuery({
    queryKey: ["platform", "plans"],
    enabled: open && targetType === "plan",
    queryFn: () => apiGetPlans().then((response) => response.data || []),
  });

  const { data: tenants = [] } = useQuery({
    queryKey: ["platform", "tenants", "announcement-picker"],
    enabled: open && targetType === "tenant",
    queryFn: () =>
      apiGetTenants({ page: 1, limit: 100 }).then((response) => response.data?.tenants || []),
  });

  const togglePlanKey = (key) => {
    setSelectedPlanKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  };

  const toggleTenant = (id) => {
    setSelectedTenantIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const titleTrim = title.trim();
    const msgTrim = message.trim();

    if (!titleTrim || !msgTrim) {
      setError("Broadcast title and message content are required");
      return;
    }
    if (titleTrim.length > 200) {
      setError("Broadcast title must not exceed 200 characters");
      return;
    }
    if (msgTrim.length > 5000) {
      setError("Message content must not exceed 5000 characters");
      return;
    }
    if (startDate && isNaN(Date.parse(startDate))) {
      setError("Please select a valid start date");
      return;
    }
    if (endDate && isNaN(Date.parse(endDate))) {
      setError("Please select a valid end date");
      return;
    }
    if (startDate && endDate && new Date(endDate).getTime() < new Date(startDate).getTime()) {
      setError("Expiration end date must be on or after the start date");
      return;
    }
    if (targetType === "plan" && selectedPlanKeys.length === 0) {
      setError("Select at least one plan for a plan-targeted broadcast");
      return;
    }
    if (targetType === "tenant" && selectedTenantIds.length === 0) {
      setError("Select at least one gym for a tenant-targeted broadcast");
      return;
    }

    setLoading(true);
    setError(null);

    const payload = {
      title: titleTrim,
      message: msgTrim,
      type,
      target: {
        type: targetType,
        targetPlanKeys: targetType === "plan" ? selectedPlanKeys : [],
        targetTenantIds: targetType === "tenant" ? selectedTenantIds : [],
      },
      startDate: startDate ? new Date(startDate).toISOString() : new Date().toISOString(),
      endDate: endDate ? new Date(endDate).toISOString() : null,
      isActive,
    };

    try {
      if (isEdit) {
        await apiUpdateAnnouncement(announcementToEdit._id, payload);
        platformToast.success("Announcement broadcast updated");
      } else {
        await apiCreateAnnouncement(payload);
        platformToast.success("Announcement broadcast scheduled");
      }
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || "Failed to save announcement");
    } finally {
      setLoading(false);
    }
  };

  const footer = (
    <div className="flex items-center justify-end gap-2.5">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <Button type="button" variant="primary" loading={loading} onClick={handleSubmit}>
        {isEdit ? "Update Broadcast" : "Publish Announcement"}
      </Button>
    </div>
  );

  return (
    <Dialog
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title={isEdit ? "Edit System Broadcast" : "Schedule New Platform Broadcast"}
      description="Broadcast high-visibility announcements to tenant gym dashboards."
      footer={footer}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Callout variant="danger">{error}</Callout>}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
            Broadcast Headline <span className="text-[var(--platform-danger)]">*</span>
          </label>
          <Input
            placeholder="e.g. Scheduled Infrastructure Maintenance on Sunday"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
            Message Body <span className="text-[var(--platform-danger)]">*</span>
          </label>
          <Textarea
            rows={3}
            placeholder="Detailed broadcast notice rendered in tenant admin console..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              Severity / Color
            </label>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="maintenance">Maintenance</option>
              <option value="feature">Feature Release</option>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              Target Audience
            </label>
            <Select value={targetType} onChange={(e) => setTargetType(e.target.value)}>
              <option value="all">All Gym Subscribers</option>
              <option value="plan">Specific Plans</option>
              <option value="tenant">Specific Gyms</option>
            </Select>
          </div>
        </div>

        {targetType === "plan" && (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
              Plans <span className="text-[var(--platform-danger)]">*</span>
            </label>
            <div className="flex flex-wrap gap-2 p-2.5 rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)]">
              {(Array.isArray(plans) ? plans : []).map((plan) => (
                <label key={plan.key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox
                    checked={selectedPlanKeys.includes(plan.key)}
                    onCheckedChange={() => togglePlanKey(plan.key)}
                  />
                  <span>{plan.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {targetType === "tenant" && (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
              Gyms <span className="text-[var(--platform-danger)]">*</span>
            </label>
            <div className="max-h-36 overflow-y-auto space-y-1.5 p-2.5 rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)]">
              {tenants.map((tenant) => (
                <label key={tenant._id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox
                    checked={selectedTenantIds.includes(String(tenant._id))}
                    onCheckedChange={() => toggleTenant(String(tenant._id))}
                  />
                  <span>{tenant.name}</span>
                  <span className="text-[var(--platform-text-muted)]">/{tenant.slug}</span>
                </label>
              ))}
              {tenants.length === 0 && (
                <span className="text-[11px] text-[var(--platform-text-muted)]">No gyms are available to target.</span>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              Start Date
            </label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--platform-text-muted)] mb-1.5">
              End Date (Optional)
            </label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="pt-2 border-t border-[var(--platform-border-subtle)] flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-[var(--platform-text-primary)]">
              Active Status
            </span>
            <p className="text-[11px] text-[var(--platform-text-muted)]">
              Disabled announcements are immediately hidden from gym dashboards.
            </p>
          </div>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </div>
      </form>
    </Dialog>
  );
}
