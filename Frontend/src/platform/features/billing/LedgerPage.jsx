import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGetLedgerEvents } from "../../lib/api/endpoints";
import {
  Button,
  Badge,
  Input,
  Select,
  CopyChip,
  Skeleton,
  EmptyState,
  Pagination,
  platformToast,
} from "../../ui";
import {
  FileSpreadsheet,
  Download,
  Filter,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Gift,
  Tag,
  Calendar,
} from "lucide-react";
import { formatCurrency, formatDate, formatRelativeTime } from "../../lib/utils/formatters";

export default function LedgerPage() {
  const [page, setPage] = useState(1);
  const [eventType, setEventType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const {
    data: ledgerResponse,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["platform", "ledger", page, eventType, fromDate, toDate],
    queryFn: () =>
      apiGetLedgerEvents({
        page,
        limit: 25,
        type: eventType || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      }).then((r) => r.data),
  });

  const events = ledgerResponse?.events || [];
  const pagination = ledgerResponse?.pagination || { total: 0, page: 1, totalPages: 1 };

  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (eventType) params.append("type", eventType);
    if (fromDate) params.append("fromDate", fromDate);
    if (toDate) params.append("toDate", toDate);

    window.open(`/api/platform/billing/ledger/export?${params.toString()}`, "_blank");
    platformToast.success("Exporting ledger events to CSV...");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--platform-text-primary)]">
              Append-Only Financial Ledger
            </h1>
            <Badge variant="success" size="sm" className="font-mono">
              <ShieldCheck className="w-3 h-3 mr-1" />
              Immutable
            </Badge>
          </div>
          <p className="text-xs text-[var(--platform-text-muted)] mt-1">
            Deterministic double-entry audit log of all subscriptions, manual grants, refunds, and price modifications.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            loading={isFetching}
          >
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Sync Ledger
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleExportCsv}
          >
            <Download className="w-4 h-4 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 p-3 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <Select
            value={eventType}
            onChange={(e) => {
              setEventType(e.target.value);
              setPage(1);
            }}
            className="w-48"
          >
            <option value="">All Event Types</option>
            <option value="purchase">Purchase / Activation</option>
            <option value="refund">Refund / Credit</option>
            <option value="manual_grant">Complimentary Grant</option>
            <option value="price_change">Price Rule Modification</option>
          </Select>

          <div className="flex items-center gap-1.5 text-xs text-[var(--platform-text-muted)]">
            <span>From:</span>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="w-36 text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-[var(--platform-text-muted)]">
            <span>To:</span>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="w-36 text-xs"
            />
          </div>

          {(eventType || fromDate || toDate) && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setEventType("");
                setFromDate("");
                setToDate("");
                setPage(1);
              }}
            >
              Reset Filters
            </Button>
          )}
        </div>

        <span className="text-xs text-[var(--platform-text-muted)] self-end md:self-center font-mono">
          {pagination.total} Total Ledger Entries
        </span>
      </div>

      {/* Ledger Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="No ledger events found"
          description="Adjust your search filters or record purchases to populate the ledger."
        />
      ) : (
        <div className="rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)] overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--platform-border-subtle)] bg-[var(--platform-canvas)] text-[var(--platform-text-muted)] font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Event ID</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Gym Tenant</th>
                <th className="py-3 px-4 text-center">Type</th>
                <th className="py-3 px-4">Tier & Cycle</th>
                <th className="py-3 px-4 text-right">Settlement Amount</th>
                <th className="py-3 px-4">Origin / Actor</th>
                <th className="py-3 px-4">Mandatory Audit Meta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--platform-border-subtle)]">
              {events.map((evt) => {
                const isPurchase = evt.type === "purchase";
                const isRefund = evt.type === "refund";
                const isGrant = evt.type === "manual_grant";
                const isPriceChange = evt.type === "price_change";

                return (
                  <tr
                    key={evt._id}
                    className="hover:bg-[var(--platform-surface-hover)] transition-colors"
                  >
                    <td className="py-3 px-4 font-mono">
                      <CopyChip text={evt._id} />
                    </td>

                    <td className="py-3 px-4 text-[11px] text-[var(--platform-text-secondary)] whitespace-nowrap">
                      <div>{formatDate(evt.createdAt)}</div>
                      <span className="text-[10px] text-[var(--platform-text-muted)]">
                        {formatRelativeTime(evt.createdAt)}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      {evt.tenantId ? (
                        <div>
                          <div className="font-medium text-[var(--platform-text-primary)]">
                            {evt.tenantId.name}
                          </div>
                          <div className="mt-0.5">
                            <CopyChip text={evt.tenantId.slug} />
                          </div>
                        </div>
                      ) : (
                        <span className="text-[var(--platform-text-muted)] italic">
                          Platform Global
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <Badge
                        variant={
                          isPurchase
                            ? "success"
                            : isRefund
                            ? "danger"
                            : isGrant
                            ? "info"
                            : "warning"
                        }
                        size="xs"
                        className="capitalize"
                      >
                        {evt.type.replace("_", " ")}
                      </Badge>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-mono text-xs uppercase text-[var(--platform-text-primary)]">
                        {evt.planKey || "—"}
                      </div>
                      <span className="text-[11px] text-[var(--platform-text-muted)] capitalize">
                        {evt.cycle || "—"}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-bold text-xs whitespace-nowrap">
                      {isRefund ? (
                        <span className="text-[var(--platform-danger)] flex items-center justify-end gap-1">
                          <TrendingDown className="w-3 h-3" />
                          -{formatCurrency(evt.amount, evt.currency || "USD")}
                        </span>
                      ) : isPurchase ? (
                        <span className="text-[var(--platform-success)] flex items-center justify-end gap-1">
                          <TrendingUp className="w-3 h-3" />
                          +{formatCurrency(evt.amount, evt.currency || "USD")}
                        </span>
                      ) : isGrant ? (
                        <span className="text-[var(--platform-info)] flex items-center justify-end gap-1">
                          <Gift className="w-3 h-3" />
                          $0.00 (Grant)
                        </span>
                      ) : (
                        <span className="text-[var(--platform-text-muted)]">
                          {formatCurrency(evt.amount, evt.currency || "USD")}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-[11px] text-[var(--platform-text-secondary)]">
                      <div className="font-mono">{evt.actorType}</div>
                      {evt.externalRef && (
                        <span className="text-[10px] text-[var(--platform-text-muted)] font-mono block truncate max-w-[120px]">
                          ref: {evt.externalRef}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-[11px] max-w-[200px]">
                      <div className="truncate text-[var(--platform-text-secondary)]">
                        {evt.meta?.reason || evt.meta?.confirmedBy || "—"}
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
            limit={pagination.limit || 25}
            totalPages={pagination.totalPages}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
