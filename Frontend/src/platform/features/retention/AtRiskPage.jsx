import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, RefreshCw, ShieldCheck, Mail, Phone } from "lucide-react";
import { apiGetAtRiskQueue } from "../../lib/api/endpoints";
import { Button, Badge, Skeleton, EmptyState, StatusPill } from "../../ui";
import { formatDate } from "../../lib/utils/formatters";

const LEVELS = [
  { value: "high", label: "High risk only" },
  { value: "medium", label: "Medium and high" },
  { value: "low", label: "Any signal" },
];

const LEVEL_VARIANT = { high: "danger", medium: "warning", low: "neutral" };

function RiskBar({ score }) {
  const tone = score >= 60 ? "var(--platform-danger)" : score >= 30 ? "var(--platform-warning)" : "var(--platform-text-muted)";
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <div className="h-1.5 flex-1 rounded-full bg-[var(--platform-surface-subtle)] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: tone }} />
      </div>
      <span className="platform-mono text-[11px] font-semibold" style={{ color: tone }}>
        {score}
      </span>
    </div>
  );
}

function AtRiskRow({ gym }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to={`/platform/tenants/${gym.id}`}
              className="text-sm font-semibold text-[var(--platform-text-primary)] hover:text-[var(--platform-accent)]"
            >
              {gym.name}
            </Link>
            <StatusPill status={gym.status} />
            <Badge variant={LEVEL_VARIANT[gym.level]} size="xs">
              {gym.level === "high" ? "High risk" : gym.level === "medium" ? "Medium risk" : "Low risk"}
            </Badge>
            {gym.plan ? <span className="text-[11px] text-[var(--platform-text-muted)]">{gym.plan}</span> : null}
          </div>
          <div className="text-[11px] text-[var(--platform-text-muted)] flex flex-wrap gap-x-3 gap-y-0.5">
            <span>{gym.memberCount} members</span>
            <span>{gym.staffCount} staff</span>
            <span>Health {gym.healthScore}/100</span>
            <span>Last activity {gym.lastActivityAt ? formatDate(gym.lastActivityAt) : "never"}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <RiskBar score={gym.riskScore} />
          <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide plan" : "Action plan"}
          </Button>
        </div>
      </div>

      <ul className="flex flex-wrap gap-1.5">
        {gym.signals.map((signal) => (
          <li
            key={signal.key}
            className="text-[11px] px-2 py-1 rounded-[var(--platform-radius-sm)] bg-[var(--platform-surface-subtle)] border border-[var(--platform-border-subtle)] text-[var(--platform-text-secondary)]"
          >
            {signal.label}
          </li>
        ))}
      </ul>

      {open && (
        <div className="rounded-[var(--platform-radius-md)] border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-subtle)] p-3 space-y-2">
          <div className="text-xs font-semibold text-[var(--platform-text-primary)]">Suggested next steps</div>
          <ol className="list-decimal pl-4 space-y-1 text-xs text-[var(--platform-text-secondary)]">
            {gym.suggestedActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ol>
          {gym.owner ? (
            <div className="flex flex-wrap gap-3 pt-1 text-xs">
              <span className="text-[var(--platform-text-muted)]">Owner: {gym.owner.name || "—"}</span>
              {gym.owner.email ? (
                <a className="inline-flex items-center gap-1 text-[var(--platform-accent)] hover:underline" href={`mailto:${gym.owner.email}`}>
                  <Mail className="w-3.5 h-3.5" /> {gym.owner.email}
                </a>
              ) : null}
              {gym.owner.phone ? (
                <a className="inline-flex items-center gap-1 text-[var(--platform-accent)] hover:underline" href={`tel:${gym.owner.phone}`}>
                  <Phone className="w-3.5 h-3.5" /> {gym.owner.phone}
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function AtRiskPage() {
  const [level, setLevel] = useState("medium");
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["platform", "at-risk", level],
    queryFn: () => apiGetAtRiskQueue({ level }).then((r) => r.data),
  });

  const gyms = data?.tenants || [];
  const totals = data?.totals || { scanned: 0, high: 0, medium: 0 };

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--platform-text-primary)]">At-risk gyms</h1>
          <p className="text-xs text-[var(--platform-text-muted)] mt-1 max-w-2xl">
            Live gyms ranked by churn risk. The score combines payment status, staff activity, members, check-in and
            renewal trends from the daily analytics, and trial usage. Open a gym&apos;s action plan for suggested next steps.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="h-8 px-2 text-xs rounded-[var(--platform-radius-sm)] border border-[var(--platform-border)] bg-[var(--platform-surface)] text-[var(--platform-text-primary)]"
            aria-label="Risk level filter"
          >
            {LEVELS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={() => refetch()} loading={isFetching}>
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5 sm:gap-4 max-w-xl">
        <div className="p-3 rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)]">
          <div className="text-[11px] text-[var(--platform-text-muted)]">High risk</div>
          <div className="text-xl font-bold platform-mono text-[var(--platform-danger)]">{totals.high}</div>
        </div>
        <div className="p-3 rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)]">
          <div className="text-[11px] text-[var(--platform-text-muted)]">Medium risk</div>
          <div className="text-xl font-bold platform-mono text-[var(--platform-warning)]">{totals.medium}</div>
        </div>
        <div className="p-3 rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)]">
          <div className="text-[11px] text-[var(--platform-text-muted)]">Gyms checked</div>
          <div className="text-xl font-bold platform-mono text-[var(--platform-text-primary)]">{totals.scanned}</div>
        </div>
      </div>

      <div className="rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] divide-y divide-[var(--platform-border-subtle)]">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ) : gyms.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No gyms at this risk level"
            description="Every live gym is active and healthy for the selected filter."
          />
        ) : (
          gyms.map((gym) => <AtRiskRow key={gym.id} gym={gym} />)
        )}
      </div>

      {gyms.some((g) => g.signals.some((s) => s.key === "checkins_drop" || s.key === "low_renewals")) ? null : (
        <p className="text-[11px] text-[var(--platform-text-muted)] flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          Check-in and renewal trends need at least two weeks of daily analytics for a gym.
        </p>
      )}
    </div>
  );
}
