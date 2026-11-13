import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Plus } from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  Input,
  Pagination,
  Select,
  Skeleton,
  Textarea,
  platformToast,
} from "../../ui";
import { ConfirmDialog } from "../../shell/ConfirmDialog";
import {
  apiGetCampaignAudience,
  apiGetCampaignTemplates,
  apiGetCampaigns,
  apiSendCampaign,
} from "../../lib/api/endpoints";
import { formatDate } from "../../lib/utils/formatters";

const STATUS_LABELS = {
  trial: "Trial",
  active: "Active",
  past_due: "Past due",
  suspended: "Suspended",
  cancelled: "Cancelled",
};

function applyTemplate(template, setForm) {
  setForm({
    templateKey: template.key,
    subject: template.subject,
    message: template.message,
    ctaLabel: template.ctaLabel || "",
    ctaUrl: template.ctaUrl || "",
    statuses: template.key === "win_back" ? ["suspended", "cancelled"] : ["trial", "active"],
  });
}

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [composeOpen, setComposeOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState(null);

  const { data: templateData } = useQuery({
    queryKey: ["platform", "campaign-templates"],
    queryFn: () => apiGetCampaignTemplates().then((response) => response.data),
  });

  const templates = templateData?.templates || [];
  const statuses = templateData?.statuses || Object.keys(STATUS_LABELS);

  const { data, isLoading } = useQuery({
    queryKey: ["platform", "campaigns", page],
    queryFn: () => apiGetCampaigns({ page, limit: 10 }).then((response) => response.data),
  });

  const campaigns = data?.campaigns || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1 };

  const audienceKey = (form?.statuses || []).slice().sort().join(",");
  const { data: audience } = useQuery({
    queryKey: ["platform", "campaign-audience", audienceKey],
    queryFn: () => apiGetCampaignAudience({ status: audienceKey }).then((response) => response.data),
    enabled: composeOpen && Boolean(audienceKey),
  });

  useEffect(() => {
    if (composeOpen && !form && templates.length) {
      applyTemplate(templates[0], setForm);
    }
  }, [composeOpen, form, templates]);

  const openCompose = () => {
    if (templates[0]) applyTemplate(templates[0], setForm);
    setComposeOpen(true);
  };

  const toggleStatus = (status) => {
    setForm((current) => {
      const next = current.statuses.includes(status)
        ? current.statuses.filter((item) => item !== status)
        : [...current.statuses, status];
      return { ...current, statuses: next };
    });
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const response = await apiSendCampaign({
        templateKey: form.templateKey,
        subject: form.subject,
        message: form.message,
        ctaLabel: form.ctaLabel,
        ctaUrl: form.ctaUrl,
        statuses: form.statuses,
      });
      platformToast.success(response.data?.message || "Campaign sent");
      setConfirmOpen(false);
      setComposeOpen(false);
      setForm(null);
      queryClient.invalidateQueries({ queryKey: ["platform", "campaigns"] });
    } catch (error) {
      platformToast.error(error?.response?.data?.message || error?.message || "Could not send the campaign");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--platform-text-primary)]">Campaigns</h1>
          <p className="mt-1 text-xs text-[var(--platform-text-muted)]">
            Email gym owners. Announcements stay inside the gym app.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={openCompose}>
          <Plus className="mr-1.5 h-4 w-4" />
          New campaign
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No campaigns yet"
          description="Send a product update, an offer, or a win-back note to gym owners."
        />
      ) : (
        <div className="overflow-hidden rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--platform-surface-subtle)] text-[var(--platform-text-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 font-medium">Audience</th>
                <th className="px-4 py-3 font-medium">Sent</th>
                <th className="px-4 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign._id} className="border-t border-[var(--platform-border-subtle)]">
                  <td className="px-4 py-3">
                    <div className="font-medium text-[var(--platform-text-primary)]">{campaign.subject}</div>
                    <div className="mt-1 text-[var(--platform-text-muted)]">
                      {(templates.find((item) => item.key === campaign.templateKey)?.label) || campaign.templateKey}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(campaign.audience?.statuses || []).map((status) => (
                        <Badge key={status}>{STATUS_LABELS[status] || status}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--platform-text-secondary)]">
                    {campaign.sentCount} sent
                    {campaign.failedCount ? ` · ${campaign.failedCount} failed` : ""}
                    {campaign.skippedCount ? ` · ${campaign.skippedCount} skipped` : ""}
                  </td>
                  <td className="px-4 py-3 text-[var(--platform-text-muted)]">
                    {formatDate(campaign.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-[var(--platform-border-subtle)] px-4 py-3">
            <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
          </div>
        </div>
      )}

      <Dialog
        isOpen={composeOpen}
        onClose={() => setComposeOpen(false)}
        title="New campaign"
        description="The message is wrapped in the Forma email layout and sent from noreply@forma-official.com."
        size="lg"
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setComposeOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!form?.subject || !form?.message || !form?.statuses?.length}
              onClick={() => setConfirmOpen(true)}
            >
              Review send
            </Button>
          </div>
        )}
      >
        {form && (
          <div className="space-y-4">
            <Select
              label="Template"
              value={form.templateKey}
              options={templates.map((template) => ({ value: template.key, label: template.label }))}
              onChange={(event) => {
                const next = templates.find((template) => template.key === event.target.value);
                if (next) applyTemplate(next, setForm);
              }}
            />
            <Input
              label="Subject"
              value={form.subject}
              onChange={(event) => setForm({ ...form, subject: event.target.value })}
            />
            <Textarea
              label="Message"
              rows={6}
              value={form.message}
              onChange={(event) => setForm({ ...form, message: event.target.value })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Button label"
                value={form.ctaLabel}
                onChange={(event) => setForm({ ...form, ctaLabel: event.target.value })}
              />
              <Input
                label="Button link"
                value={form.ctaUrl}
                onChange={(event) => setForm({ ...form, ctaUrl: event.target.value })}
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-[var(--platform-text-secondary)]">Gym status</legend>
              <div className="flex flex-wrap gap-3">
                {statuses.map((status) => (
                  <Checkbox
                    key={status}
                    label={STATUS_LABELS[status] || status}
                    checked={form.statuses.includes(status)}
                    onCheckedChange={() => toggleStatus(status)}
                  />
                ))}
              </div>
              <p className="text-xs text-[var(--platform-text-muted)]">
                {audience
                  ? `${audience.count} owners will receive this${audience.skipped ? `. ${audience.skipped} gyms have no owner email.` : "."}`
                  : "Choose who should receive it."}
              </p>
            </fieldset>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        requireReason={false}
        variant="primary"
        title="Send this campaign"
        description={audience
          ? `This emails ${audience.count} gym owners now.`
          : "This emails the selected gym owners now."}
        confirmLabel="Send now"
        loading={sending}
        onConfirm={handleSend}
      />
    </div>
  );
}
