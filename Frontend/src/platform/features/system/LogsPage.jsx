import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGetBackendLogs, apiGetFrontendLogs } from "../../lib/api/endpoints";
import { usePermission } from "../../lib/auth/PermissionContext";
import { formatDate } from "../../lib/utils/formatters";
import {
  Button,
  Badge,
  Input,
  Select,
  Skeleton,
  EmptyState,
  ErrorState,
  NoPermission,
  Tabs,
  TabsList,
  TabTrigger,
  TabContent,
} from "../../ui";
import { RefreshCw, Search, ScrollText, Server, Monitor } from "lucide-react";

const SOURCES = {
  backend: {
    label: "Backend",
    icon: Server,
    description: "Application, request, and build logs from the Render service.",
    fetch: apiGetBackendLogs,
  },
  frontend: {
    label: "Frontend",
    icon: Monitor,
    description: "Latest runtime and request logs from the production Vercel deployment.",
    fetch: apiGetFrontendLogs,
  },
};

function levelVariant(level) {
  if (level === "error") return "danger";
  if (level === "warn") return "warning";
  if (level === "debug") return "neutral";
  return "info";
}

function mergeLogs(liveLogs, olderLogs) {
  const seen = new Set();
  const merged = [];
  for (const log of [...liveLogs, ...olderLogs]) {
    if (!log?.id || seen.has(log.id)) continue;
    seen.add(log.id);
    merged.push(log);
  }
  return merged;
}

export default function LogsPage() {
  const canHealth = usePermission("system.health");
  const [source, setSource] = useState("backend");
  const [level, setLevel] = useState("");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [olderLogs, setOlderLogs] = useState([]);
  const [olderPage, setOlderPage] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState("");

  const sourceConfig = SOURCES[source];

  const {
    data,
    error,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["platform", "logs", source, level, type, search],
    enabled: canHealth,
    refetchInterval: 15000,
    queryFn: () =>
      sourceConfig
        .fetch({
          level: level || undefined,
          type: source === "backend" ? type || undefined : undefined,
          text: search || undefined,
          limit: 50,
        })
        .then((response) => response.data),
  });

  useEffect(() => {
    setOlderLogs([]);
    setOlderPage(null);
    setOlderError("");
  }, [source, level, type, search]);

  if (!canHealth) {
    return <NoPermission requiredPermission="system.health" />;
  }

  const liveLogs = data?.logs || [];
  const logs = mergeLogs(liveLogs, olderLogs);
  const page = olderPage || data?.page;
  const canLoadOlder = source === "backend" && Boolean(page?.hasMore && page?.nextStartTime && page?.nextEndTime);

  const loadOlder = async () => {
    if (!canLoadOlder) return;
    setLoadingOlder(true);
    try {
      const response = await apiGetBackendLogs({
        level: level || undefined,
        type: type || undefined,
        text: search || undefined,
        limit: 50,
        startTime: page.nextStartTime,
        endTime: page.nextEndTime,
      });
      setOlderLogs((current) => mergeLogs(current, response.data?.logs || []));
      setOlderPage(response.data?.page || null);
      setOlderError("");
    } catch (err) {
      setOlderError(err?.message || "Could not load older logs");
    } finally {
      setLoadingOlder(false);
    }
  };

  const resetFilters = () => {
    setLevel("");
    setType("");
    setSearch("");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--platform-text-primary)]">
            Runtime Logs
          </h1>
          <p className="text-xs text-[var(--platform-text-muted)] mt-1">
            {sourceConfig.description}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} loading={isFetching}>
          <RefreshCw className="w-4 h-4 mr-1.5" />
          Refresh
        </Button>
      </div>

      <Tabs value={source} onChange={setSource}>
        <TabsList>
          <TabTrigger value="backend" icon={Server}>Backend</TabTrigger>
          <TabTrigger value="frontend" icon={Monitor}>Frontend</TabTrigger>
        </TabsList>

        <TabContent value={source}>
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 p-3 rounded-lg bg-[var(--platform-surface-raised)] border border-[var(--platform-border-subtle)]">
            <div className="flex flex-wrap items-center gap-2.5 w-full">
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--platform-text-muted)]" />
                <Input
                  placeholder="Search log text..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-8 text-xs"
                  aria-label="Search log text"
                />
              </div>
              <div className="w-full sm:w-36">
                <Select
                  value={level}
                  onChange={(event) => setLevel(event.target.value)}
                  aria-label="Log level"
                  options={[
                    { value: "", label: "All levels" },
                    { value: "error", label: "Error" },
                    { value: "warn", label: "Warning" },
                    { value: "info", label: "Info" },
                    { value: "debug", label: "Debug" },
                  ]}
                />
              </div>
              {source === "backend" && (
                <div className="w-full sm:w-36">
                  <Select
                    value={type}
                    onChange={(event) => setType(event.target.value)}
                    aria-label="Log type"
                    options={[
                      { value: "", label: "All types" },
                      { value: "app", label: "Application" },
                      { value: "request", label: "Request" },
                      { value: "build", label: "Build" },
                    ]}
                  />
                </div>
              )}
              {(level || type || search) && (
                <Button variant="ghost" size="xs" onClick={resetFilters}>
                  Reset Filters
                </Button>
              )}
            </div>
            <span className="text-xs text-[var(--platform-text-muted)] self-end md:self-center font-mono">
              {logs.length} lines
            </span>
          </div>

          <div className="mt-4">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5, 6].map((row) => (
                  <Skeleton key={row} className="h-12 w-full rounded-md" />
                ))}
              </div>
            ) : isError ? (
              <ErrorState
                title="Could not load logs"
                message={error?.message || "The log host did not return a usable response."}
                onRetry={() => refetch()}
              />
            ) : data?.configured === false ? (
              <EmptyState
                icon={ScrollText}
                title="Log source is not configured"
                description={`Set ${(data.missing || []).join(", ")} on the backend service, then refresh.`}
              />
            ) : logs.length === 0 ? (
              <EmptyState
                icon={ScrollText}
                title="No log lines in this window"
                description={
                  source === "frontend"
                    ? "The latest production deployment did not return matching runtime logs."
                    : "Try a wider level, type, or search."
                }
              />
            ) : (
              <div className="rounded-lg border border-[var(--platform-border-subtle)] bg-[var(--platform-surface-raised)] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--platform-border-subtle)] text-[10px] uppercase tracking-wide text-[var(--platform-text-muted)]">
                        <th className="px-3 py-2 font-medium">Time</th>
                        <th className="px-3 py-2 font-medium">Level</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id} className="border-b border-[var(--platform-border-subtle)] last:border-0 align-top">
                          <td className="px-3 py-2 whitespace-nowrap text-[11px] platform-mono text-[var(--platform-text-muted)]">
                            {formatDate(log.timestamp, true)}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant={levelVariant(log.level)} size="sm">{log.level}</Badge>
                          </td>
                          <td className="px-3 py-2 text-[11px] platform-mono text-[var(--platform-text-secondary)]">
                            {log.type || "—"}
                          </td>
                          <td className="px-3 py-2 text-xs platform-mono text-[var(--platform-text-primary)] break-all">
                            {log.message || "—"}
                            {(log.requestMethod || log.requestPath || log.statusCode) && (
                              <div className="mt-1 text-[10px] text-[var(--platform-text-muted)]">
                                {[log.requestMethod, log.requestPath, log.statusCode].filter(Boolean).join(" ")}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {source === "backend" && (
                  <div className="flex flex-col items-center gap-2 border-t border-[var(--platform-border-subtle)] px-3 py-2">
                    {olderError && (
                      <p className="text-xs text-[var(--platform-danger)]">{olderError}</p>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={loadOlder}
                      loading={loadingOlder}
                      disabled={!canLoadOlder}
                    >
                      Load older
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </TabContent>
      </Tabs>
    </div>
  );
}
