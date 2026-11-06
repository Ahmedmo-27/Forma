import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  apiGetPendingPayments,
  apiConfirmPayment,
  apiRejectPayment,
  apiGetInvoices,
} from "../../lib/api/endpoints";
import {
  Button,
  Badge,
  Input,
  Select,
  Tabs,
  TabsList,
  TabTrigger,
  TabContent,
  CopyChip,
  Skeleton,
  EmptyState,
  Pagination,
  platformToast,
} from "../../ui";
import { ConfirmDialog } from "../../shell/ConfirmDialog";
import ManualGrantModal from "./ManualGrantModal";
import ProcessRefundModal from "./ProcessRefundModal";
import {
  CreditCard,
  FileText,
  CheckCircle2,
  XCircle,
  Download,
  Gift,
  RotateCcw,
  Clock,
  Search,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { formatCurrency, formatDate, formatRelativeTime } from "../../lib/utils/formatters";

export default function PaymentsInvoicesPage() {
  const [activeTab, setActiveTab] = useState("inbox");

  // Filters & Pagination for Payments
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("pending");

  // Filters & Pagination for Invoices
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState("");
  const [invoicePage, setInvoicePage] = useState(1);

  // Modals state
  const [grantModalOpen, setGrantModalOpen] = useState(false);
  const [refundModalOpen, setRefundModalOpen] = useState(false);

  // Confirmation state for Payment Review
  const [confirmPaymentTarget, setConfirmPaymentTarget] = useState(null);
  const [rejectPaymentTarget, setRejectPaymentTarget] = useState(null);
  const [reviewing, setReviewing] = useState(false);

  // Queries
  const {
    data: paymentsResponse,
    isLoading: paymentsLoading,
    refetch: refetchPayments,
  } = useQuery({
    queryKey: ["platform", "pending-payments", paymentPage, paymentSearch, paymentStatus],
    queryFn: () =>
      apiGetPendingPayments({
        page: paymentPage,
        limit: 15,
        status: paymentStatus || undefined,
        search: paymentSearch.trim() || undefined,
      }).then((r) => r.data),
  });

  const {
    data: invoicesResponse,
    isLoading: invoicesLoading,
    refetch: refetchInvoices,
  } = useQuery({
    queryKey: ["platform", "invoices", invoicePage, invoiceSearch, invoiceStatus],
    queryFn: () =>
      apiGetInvoices({
        page: invoicePage,
        limit: 15,
        search: invoiceSearch || undefined,
        status: invoiceStatus || undefined,
      }).then((r) => r.data),
  });

  const payments = Array.isArray(paymentsResponse)
    ? paymentsResponse
    : paymentsResponse?.payments || [];
  const paymentsPagination = paymentsResponse?.pagination || {
    total: payments.length,
    page: 1,
    limit: 15,
    totalPages: 1,
  };

  const invoices = invoicesResponse?.invoices || [];
  const pagination = invoicesResponse?.pagination || { total: 0, page: 1, limit: 15, totalPages: 1 };

  // Handle Approve Payment
  const handleConfirmPayment = async (reason) => {
    if (!confirmPaymentTarget) return;
    setReviewing(true);
    try {
      const res = await apiConfirmPayment(confirmPaymentTarget._id, { reason });
      platformToast.success(
        `Payment confirmed! Invoice ${res.data?.invoiceNumber || ""} issued`
      );
      setConfirmPaymentTarget(null);
      refetchPayments();
      refetchInvoices();
    } catch (err) {
      platformToast.error(err.normalized?.message || err.response?.data?.error?.message || err?.message || "Failed to confirm payment");
    } finally {
      setReviewing(false);
    }
  };

  // Handle Reject Payment
  const handleRejectPayment = async (reason) => {
    if (!rejectPaymentTarget) return;
    setReviewing(true);
    try {
      await apiRejectPayment(rejectPaymentTarget._id, { reason });
      platformToast.success("Payment submission rejected");
      setRejectPaymentTarget(null);
      refetchPayments();
    } catch (err) {
      platformToast.error(err.normalized?.message || err.response?.data?.error?.message || err?.message || "Failed to reject payment");
    } finally {
      setReviewing(false);
    }
  };

  const handleDownloadInvoice = (invoiceId) => {
    window.open(`/api/platform/billing/invoices/${invoiceId}/download`, "_blank");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--platform-text-primary)]">
              Payments & Invoices Desk
            </h1>
            <Badge variant="neutral" size="sm" className="font-mono">
              SLA 24h
            </Badge>
          </div>
          <p className="text-xs text-[var(--platform-text-muted)] mt-1">
            Review offline bank transfers, approve activations, issue grants, and audit tax invoices.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefundModalOpen(true)}
          >
            <RotateCcw className="w-4 h-4 mr-1.5" />
            Process Refund
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setGrantModalOpen(true)}
          >
            <Gift className="w-4 h-4 mr-1.5" />
            Issue Grant
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Awaiting Review</span>
            <Clock className="w-4 h-4 text-[var(--platform-warning)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-warning)]">
            {payments.filter((p) => p.status === "pending").length}
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">Manual bank wires pending</span>
        </div>

        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Pending Value</span>
            <CreditCard className="w-4 h-4 text-[var(--platform-accent)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-text-primary)]">
            {formatCurrency(
              payments
                .filter((p) => p.status === "pending")
                .reduce((acc, p) => acc + (p.amount || 0), 0),
              "USD"
            )}
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">Unsettled transfers</span>
        </div>

        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Invoices Generated</span>
            <FileText className="w-4 h-4 text-[var(--platform-info)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-text-primary)]">
            {pagination.total || invoices.length}
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">Tax compliant records</span>
        </div>

        <div className="p-4 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
          <div className="flex items-center justify-between text-xs text-[var(--platform-text-muted)] mb-1">
            <span>Settled Ledger</span>
            <ShieldCheck className="w-4 h-4 text-[var(--platform-success)]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[var(--platform-success)]">
            100%
          </div>
          <span className="text-[11px] text-[var(--platform-text-muted)]">Deterministic sync</span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onChange={setActiveTab}>
        <TabsList>
          <TabTrigger value="inbox">
            Payments Inbox ({paymentsPagination.total || payments.length})
          </TabTrigger>
          <TabTrigger value="invoices">
            Invoices Archive ({pagination.total || invoices.length})
          </TabTrigger>
        </TabsList>

        {/* Tab 1: Payments Inbox */}
        <TabContent value="inbox" className="space-y-4 mt-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--platform-text-muted)]" />
                <Input
                  placeholder="Search payment ref or notes..."
                  value={paymentSearch}
                  onChange={(e) => {
                    setPaymentSearch(e.target.value);
                    setPaymentPage(1);
                  }}
                  className="pl-8"
                />
              </div>

              <Select
                value={paymentStatus}
                onChange={(e) => {
                  setPaymentStatus(e.target.value);
                  setPaymentPage(1);
                }}
                className="w-40"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending Review</option>
                <option value="confirmed">Confirmed</option>
                <option value="rejected">Rejected</option>
              </Select>
            </div>

            <span className="text-xs text-[var(--platform-text-muted)] self-end sm:self-center">
              Total {paymentsPagination.total} submissions
            </span>
          </div>

          {paymentsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : payments.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="Payments inbox is clear"
              description="No manual bank transfers are currently awaiting review."
            />
          ) : (
            <div className="rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)] overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)] text-[var(--platform-text-muted)] font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Gym Tenant</th>
                    <th className="py-3 px-4">Requested Tier</th>
                    <th className="py-3 px-4">Transfer Amount</th>
                    <th className="py-3 px-4">Wire Reference</th>
                    <th className="py-3 px-4">Submission</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Review Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--platform-border-subtle)]">
                  {payments.map((p) => {
                    const isPending = p.status === "pending";
                    return (
                      <tr
                        key={p._id}
                        className="hover:bg-[var(--platform-surface-hover)] transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="font-medium text-[var(--platform-text-primary)]">
                            {p.tenantId?.name || "Unknown Gym"}
                          </div>
                          <div className="mt-0.5">
                            <CopyChip text={p.tenantId?.slug || "unknown"} />
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-mono text-xs capitalize text-[var(--platform-text-primary)]">
                            {p.planKey}
                          </div>
                          <Badge variant="neutral" size="xs" className="capitalize">
                            {p.cycle}
                          </Badge>
                        </td>

                        <td className="py-3 px-4 font-mono font-bold text-sm text-[var(--platform-text-primary)]">
                          {formatCurrency(p.amount, p.currency || "USD")}
                        </td>

                        <td className="py-3 px-4 font-mono text-[11px]">
                          <CopyChip text={p.paymentRef} />
                        </td>

                        <td className="py-3 px-4 text-[11px] text-[var(--platform-text-secondary)]">
                          <div>{p.submittedBy?.email || "Gym Owner"}</div>
                          <span className="text-[10px] text-[var(--platform-text-muted)]">
                            {formatRelativeTime(p.createdAt)}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <Badge
                            variant={
                              p.status === "confirmed"
                                ? "success"
                                : p.status === "rejected"
                                ? "danger"
                                : "warning"
                            }
                            size="xs"
                            className="capitalize"
                          >
                            {p.status}
                          </Badge>
                        </td>

                        <td className="py-3 px-4 text-right">
                          {isPending ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="xs"
                                className="text-[var(--platform-danger)] hover:bg-[var(--platform-danger-surface)]"
                                onClick={() => setRejectPaymentTarget(p)}
                              >
                                <XCircle className="w-3.5 h-3.5 mr-1" />
                                Reject
                              </Button>

                              <Button
                                variant="primary"
                                size="xs"
                                onClick={() => setConfirmPaymentTarget(p)}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                Approve
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[var(--platform-text-muted)]">
                              Reviewed
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {paymentsPagination.totalPages > 1 && (
            <div className="flex justify-end pt-2">
              <Pagination
                page={paymentsPagination.page}
                total={paymentsPagination.total}
                limit={paymentsPagination.limit || 15}
                totalPages={paymentsPagination.totalPages}
                onPageChange={setPaymentPage}
              />
            </div>
          )}
        </TabContent>

        {/* Tab 2: Invoices Archive */}
        <TabContent value="invoices" className="space-y-4 mt-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--platform-text-muted)]" />
                <Input
                  placeholder="Search invoice number or gym..."
                  value={invoiceSearch}
                  onChange={(e) => {
                    setInvoiceSearch(e.target.value);
                    setInvoicePage(1);
                  }}
                  className="pl-8"
                />
              </div>

              <Select
                value={invoiceStatus}
                onChange={(e) => {
                  setInvoiceStatus(e.target.value);
                  setInvoicePage(1);
                }}
                className="w-40"
              >
                <option value="">All Statuses</option>
                <option value="paid">Paid / Settled</option>
                <option value="pending">Pending</option>
                <option value="void">Void</option>
              </Select>
            </div>

            <span className="text-xs text-[var(--platform-text-muted)] self-end sm:self-center">
              Total {pagination.total} invoices recorded
            </span>
          </div>

          {/* Invoices Table */}
          {invoicesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No invoices found"
              description="Try modifying search filters or approve incoming payments to generate tax invoices."
            />
          ) : (
            <div className="rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)] overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)] text-[var(--platform-text-muted)] font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Billed Gym Subscriber</th>
                    <th className="py-3 px-4">Commercial Line Items</th>
                    <th className="py-3 px-4">Settled Amount</th>
                    <th className="py-3 px-4">Issued Date</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Document</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--platform-border-subtle)]">
                  {invoices.map((inv) => (
                    <tr
                      key={inv._id}
                      className="hover:bg-[var(--platform-surface-hover)] transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-medium text-[var(--platform-text-primary)]">
                        <CopyChip text={inv.invoiceNumber} />
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-[var(--platform-text-primary)]">
                          {inv.buyerDetails?.tenantName || "Unknown Tenant"}
                        </div>
                        <span className="text-[11px] font-mono text-[var(--platform-text-muted)]">
                          {inv.buyerDetails?.tenantSlug}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          {inv.lineItems?.map((item, idx) => (
                            <div key={idx} className="text-xs text-[var(--platform-text-secondary)]">
                              {item.description}
                            </div>
                          ))}
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-sm text-[var(--platform-text-primary)]">
                        {formatCurrency(inv.total, inv.currency || "USD")}
                      </td>

                      <td className="py-3 px-4 text-[11px] text-[var(--platform-text-secondary)]">
                        <div>{formatDate(inv.issuedAt)}</div>
                        <span className="text-[10px] text-[var(--platform-text-muted)]">
                          {formatRelativeTime(inv.issuedAt)}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <Badge
                          variant={inv.status === "paid" ? "success" : "neutral"}
                          size="xs"
                          className="capitalize"
                        >
                          {inv.status}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleDownloadInvoice(inv._id)}
                        >
                          <Download className="w-3.5 h-3.5 mr-1" />
                          View / Print
                        </Button>
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
                limit={pagination.limit || 15}
                totalPages={pagination.totalPages}
                onPageChange={setInvoicePage}
              />
            </div>
          )}
        </TabContent>
      </Tabs>

      {/* Confirmation Dialogs for Review */}
      <ConfirmDialog
        open={Boolean(confirmPaymentTarget)}
        onOpenChange={(open) => !open && setConfirmPaymentTarget(null)}
        title="Approve & Confirm Manual Payment"
        description={`Confirming payment of ${formatCurrency(
          confirmPaymentTarget?.amount,
          confirmPaymentTarget?.currency || "USD"
        )} will immediately activate subscription tier ${
          confirmPaymentTarget?.planKey
        } and issue an official tax invoice.`}
        confirmText="Confirm Payment & Activate"
        variant="primary"
        requireReason={true}
        loading={reviewing}
        onConfirm={handleConfirmPayment}
      />

      <ConfirmDialog
        open={Boolean(rejectPaymentTarget)}
        onOpenChange={(open) => !open && setRejectPaymentTarget(null)}
        title="Reject Payment Submission"
        description="Rejecting this transfer will leave the tenant in their current status and mark the submission rejected."
        confirmText="Reject Transfer"
        variant="danger"
        requireReason={true}
        loading={reviewing}
        onConfirm={handleRejectPayment}
      />

      {/* Quick Action Modals */}
      <ManualGrantModal
        open={grantModalOpen}
        onOpenChange={setGrantModalOpen}
        onGranted={() => {
          refetchPayments();
          refetchInvoices();
        }}
      />

      <ProcessRefundModal
        open={refundModalOpen}
        onOpenChange={setRefundModalOpen}
        onRefunded={() => {
          refetchPayments();
          refetchInvoices();
        }}
      />
    </div>
  );
}
