import { useState } from "react";
import { Calendar, ChevronDown, X } from "lucide-react";
import { Popover } from "./Popover";
import { Button } from "./Button";
import { cn } from "../lib/utils/cn";

export function DateRangePicker({
  fromDate,
  toDate,
  onChange,
  className = "",
}) {
  const [tempFrom, setTempFrom] = useState(fromDate || "");
  const [tempTo, setTempTo] = useState(toDate || "");

  const presets = [
    {
      label: "Today",
      getRange: () => {
        const d = new Date().toISOString().split("T")[0];
        return { from: d, to: d };
      },
    },
    {
      label: "Last 7 Days",
      getRange: () => {
        const now = new Date();
        const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return { from: past.toISOString().split("T")[0], to: now.toISOString().split("T")[0] };
      },
    },
    {
      label: "Last 30 Days",
      getRange: () => {
        const now = new Date();
        const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return { from: past.toISOString().split("T")[0], to: now.toISOString().split("T")[0] };
      },
    },
    {
      label: "This Month",
      getRange: () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        return { from: start.toISOString().split("T")[0], to: now.toISOString().split("T")[0] };
      },
    },
  ];

  const hasFilter = Boolean(fromDate || toDate);

  const displayText = hasFilter
    ? `${fromDate || "Any"} → ${toDate || "Any"}`
    : "Date range...";

  return (
    <Popover
      align="end"
      trigger={
        <div
          className={cn(
            "h-[var(--platform-input-h)] px-2.5 text-xs rounded-[var(--platform-radius-md)] flex items-center gap-2 border select-none transition-colors",
            hasFilter
              ? "bg-[var(--platform-accent-subtle)] text-[var(--platform-accent)] border-[var(--platform-accent)]/30 font-medium"
              : "bg-[var(--platform-surface)] text-[var(--platform-text-secondary)] border-[var(--platform-border-strong)] hover:text-[var(--platform-text-primary)]",
            className
          )}
        >
          <Calendar className="w-3.5 h-3.5 text-current shrink-0" />
          <span className="platform-mono text-[11px] truncate max-w-[160px]">{displayText}</span>
          {hasFilter ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setTempFrom("");
                setTempTo("");
                onChange?.({ fromDate: "", toDate: "" });
              }}
              className="p-0.5 hover:text-[var(--platform-danger)]"
            >
              <X className="w-3 h-3" />
            </button>
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-[var(--platform-text-muted)] shrink-0" />
          )}
        </div>
      }
      content={({ close }) => (
        <div className="w-64 space-y-3">
          <div className="text-[11px] font-semibold uppercase text-[var(--platform-text-muted)] tracking-wider">
            Quick Presets
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  const r = p.getRange();
                  setTempFrom(r.from);
                  setTempTo(r.to);
                  onChange?.({ fromDate: r.from, toDate: r.to });
                  close();
                }}
                className="px-2 py-1.5 text-xs text-left rounded-[var(--platform-radius-sm)] bg-[var(--platform-surface-subtle)] text-[var(--platform-text-secondary)] hover:text-[var(--platform-text-primary)] hover:bg-[var(--platform-border)] transition-colors cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="pt-2 border-t border-[var(--platform-border-subtle)] space-y-2">
            <div>
              <label className="block text-[11px] text-[var(--platform-text-muted)] mb-1">
                From Date
              </label>
              <input
                type="date"
                value={tempFrom}
                onChange={(e) => setTempFrom(e.target.value)}
                className="w-full h-7 px-2 text-xs rounded-[var(--platform-radius-sm)] bg-[var(--platform-surface)] border border-[var(--platform-border-strong)] text-[var(--platform-text-primary)] outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[var(--platform-text-muted)] mb-1">
                To Date
              </label>
              <input
                type="date"
                value={tempTo}
                onChange={(e) => setTempTo(e.target.value)}
                className="w-full h-7 px-2 text-xs rounded-[var(--platform-radius-sm)] bg-[var(--platform-surface)] border border-[var(--platform-border-strong)] text-[var(--platform-text-primary)] outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--platform-border-subtle)]">
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                setTempFrom("");
                setTempTo("");
                onChange?.({ fromDate: "", toDate: "" });
                close();
              }}
            >
              Reset
            </Button>
            <Button
              size="xs"
              variant="primary"
              onClick={() => {
                onChange?.({ fromDate: tempFrom, toDate: tempTo });
                close();
              }}
            >
              Apply Range
            </Button>
          </div>
        </div>
      )}
    />
  );
}
