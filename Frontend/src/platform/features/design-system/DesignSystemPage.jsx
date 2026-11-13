import { useState } from "react";
import {
  Button,
  Input,
  Textarea,
  Select,
  Combobox,
  Checkbox,
  Radio,
  Switch,
  Badge,
  StatusPill,
  Tooltip,
  Popover,
  DropdownMenu,
  Dialog,
  Drawer,
  Skeleton,
  Avatar,
  Breadcrumbs,
  Pagination,
  UsageMeter,
  Callout,
  Kbd,
  CopyChip,
  Tabs,
  TabsList,
  TabTrigger,
  TabContent,
  DateRangePicker,
  EmptyState,
  ErrorState,
  NoPermission,
  platformToast,
} from "../../ui";
import { usePlatformTheme } from "../../lib/theme/ThemeContext";
import {
  Search,
  Sparkles,
  Shield,
  Download,
  Trash2,
  ExternalLink,
  ChevronRight,
  Sun,
  Moon,
  Laptop,
} from "lucide-react";

export default function DesignSystemPage() {
  const { theme, setTheme, density, setDensity, resolvedTheme } = usePlatformTheme();

  // Component state demonstrations
  const [comboboxVal, setComboboxVal] = useState("titan");
  const [checkVal, setCheckVal] = useState(true);
  const [radioVal, setRadioVal] = useState("prod");
  const [switchVal, setSwitchVal] = useState(true);
  const [dateRange, setDateRange] = useState({ fromDate: "2026-11-01", toDate: "2026-11-06" });
  const [page, setPage] = useState(2);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const sampleComboboxOptions = [
    { value: "titan", label: "Titan Fitness Center", description: "/titan-fitness" },
    { value: "iron", label: "Iron Paradise Gym", description: "/iron-paradise" },
    { value: "power", label: "Powerhouse Gym Club", description: "/powerhouse" },
    { value: "metro", label: "Metro Athletics", description: "/metro-fit" },
  ];

  return (
    <div className="space-y-10 pb-20 text-left">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[var(--platform-border-subtle)]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[var(--platform-text-primary)]">
              Platform V2 Living Design System
            </h1>
            <Badge variant="accent">Tokens & Primitives</Badge>
          </div>
          <p className="text-xs text-[var(--platform-text-muted)] mt-1">
            Authoritative component specification and interactive sandbox for the Super Admin console.
          </p>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-3">
          {/* Density Switch */}
          <div className="flex items-center gap-1 p-1 rounded-[var(--platform-radius-md)] bg-[var(--platform-surface-subtle)] border border-[var(--platform-border)] text-xs">
            <button
              onClick={() => setDensity("comfortable")}
              className={`px-2 py-1 rounded-[var(--platform-radius-sm)] font-medium cursor-pointer ${
                density === "comfortable"
                  ? "bg-[var(--platform-surface)] text-[var(--platform-text-primary)] shadow-xs"
                  : "text-[var(--platform-text-muted)] hover:text-[var(--platform-text-primary)]"
              }`}
            >
              Comfortable
            </button>
            <button
              onClick={() => setDensity("compact")}
              className={`px-2 py-1 rounded-[var(--platform-radius-sm)] font-medium cursor-pointer ${
                density === "compact"
                  ? "bg-[var(--platform-surface)] text-[var(--platform-text-primary)] shadow-xs"
                  : "text-[var(--platform-text-muted)] hover:text-[var(--platform-text-primary)]"
              }`}
            >
              Compact
            </button>
          </div>

          {/* Theme Switch */}
          <div className="flex items-center gap-1 p-1 rounded-[var(--platform-radius-md)] bg-[var(--platform-surface-subtle)] border border-[var(--platform-border)] text-xs">
            <button
              type="button"
              onClick={() => setTheme("light")}
              aria-label="Switch to light mode"
              className={`p-1.5 rounded-[var(--platform-radius-sm)] cursor-pointer ${
                theme === "light"
                  ? "bg-[var(--platform-surface)] text-[var(--platform-text-primary)] shadow-xs"
                  : "text-[var(--platform-text-muted)]"
              }`}
              title="Light Mode"
            >
              <Sun className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              aria-label="Switch to dark mode"
              className={`p-1.5 rounded-[var(--platform-radius-sm)] cursor-pointer ${
                theme === "dark"
                  ? "bg-[var(--platform-surface)] text-[var(--platform-text-primary)] shadow-xs"
                  : "text-[var(--platform-text-muted)]"
              }`}
              title="Dark Mode"
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setTheme("system")}
              aria-label="Switch to system theme"
              className={`p-1.5 rounded-[var(--platform-radius-sm)] cursor-pointer ${
                theme === "system"
                  ? "bg-[var(--platform-surface)] text-[var(--platform-text-primary)] shadow-xs"
                  : "text-[var(--platform-text-muted)]"
              }`}
              title="System Default"
            >
              <Laptop className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 1: COLOR PALETTE & SURFACES */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
          1. Surfaces, Borders & Semantic Colors
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="p-3 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)]">
            <div className="h-6 rounded bg-[var(--platform-canvas)] border border-[var(--platform-border)] mb-2" />
            <div className="text-xs font-semibold">Canvas</div>
            <div className="text-[10px] platform-mono text-[var(--platform-text-muted)]">--platform-canvas</div>
          </div>
          <div className="p-3 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)]">
            <div className="h-6 rounded bg-[var(--platform-surface)] border border-[var(--platform-border)] mb-2" />
            <div className="text-xs font-semibold">Surface</div>
            <div className="text-[10px] platform-mono text-[var(--platform-text-muted)]">--platform-surface</div>
          </div>
          <div className="p-3 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)]">
            <div className="h-6 rounded bg-[var(--platform-surface-subtle)] border border-[var(--platform-border-subtle)] mb-2" />
            <div className="text-xs font-semibold">Surface Subtle</div>
            <div className="text-[10px] platform-mono text-[var(--platform-text-muted)]">--platform-surface-subtle</div>
          </div>
          <div className="p-3 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)]">
            <div className="h-6 rounded bg-[var(--platform-accent)] mb-2" />
            <div className="text-xs font-semibold">Accent Cobalt</div>
            <div className="text-[10px] platform-mono text-[var(--platform-text-muted)]">--platform-accent</div>
          </div>
          <div className="p-3 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)]">
            <div className="h-6 rounded bg-[var(--platform-success)] mb-2" />
            <div className="text-xs font-semibold">Success</div>
            <div className="text-[10px] platform-mono text-[var(--platform-text-muted)]">--platform-success</div>
          </div>
          <div className="p-3 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)]">
            <div className="h-6 rounded bg-[var(--platform-danger)] mb-2" />
            <div className="text-xs font-semibold">Danger</div>
            <div className="text-[10px] platform-mono text-[var(--platform-text-muted)]">--platform-danger</div>
          </div>
        </div>
      </section>

      {/* SECTION 2: BUTTONS */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
          2. Button Variants & Interaction States
        </h2>
        <div className="p-5 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary Action</Button>
            <Button variant="secondary">Secondary Action</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Destructive</Button>
            <Button variant="danger-outline">Danger Outline</Button>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[var(--platform-border-subtle)]">
            <Button size="xs" variant="primary">Size XS</Button>
            <Button size="sm" variant="primary">Size SM</Button>
            <Button size="md" variant="primary">Size MD</Button>
            <Button size="lg" variant="primary">Size LG</Button>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[var(--platform-border-subtle)]">
            <Button variant="primary" leftIcon={Sparkles}>With Left Icon</Button>
            <Button variant="outline" rightIcon={ChevronRight}>With Right Icon</Button>
            <Button variant="primary" loading>Loading State</Button>
            <Button variant="secondary" disabled>Disabled State</Button>
          </div>
        </div>
      </section>

      {/* SECTION 3: FORM CONTROLS */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
          3. Form Controls & Inputs
        </h2>
        <div className="p-5 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Standard Text Input"
              placeholder="e.g. Acme Fitness"
              helperText="Descriptive label helper text"
            />
            <Input
              label="Monospace Slug Input"
              placeholder="acme-fitness"
              isMono
              leftIcon={Search}
              defaultValue="titan-fit"
            />
            <Input
              label="Error State Input"
              defaultValue="invalid-email"
              error="A valid email address is required"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select
              label="Cycle Selector"
              options={[
                { value: "monthly", label: "Monthly Recurring" },
                { value: "yearly", label: "Annual Contract" },
              ]}
              defaultValue="monthly"
            />
            <Combobox
              label="Subscriber Combobox"
              options={sampleComboboxOptions}
              value={comboboxVal}
              onChange={setComboboxVal}
            />
            <DateRangePicker
              fromDate={dateRange.fromDate}
              toDate={dateRange.toDate}
              onChange={setDateRange}
            />
          </div>

          <Textarea
            label="Mandatory Reason Textarea"
            placeholder="State the audit reason for this action..."
            required
            maxLength={250}
            defaultValue="Customer requested immediate subscription cancellation."
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-[var(--platform-border-subtle)]">
            <Checkbox
              label="Maintenance Gating"
              description="Restrict tenant-facing mutating operations"
              checked={checkVal}
              onChange={setCheckVal}
            />
            <Switch
              label="Live Sync Telemetry"
              description="Stream live audit events to active view"
              checked={switchVal}
              onChange={setSwitchVal}
            />
            <div className="space-y-2">
              <span className="block text-xs font-medium text-[var(--platform-text-secondary)]">
                Environment Tier
              </span>
              <div className="flex gap-4">
                <Radio
                  name="env"
                  value="prod"
                  label="Production"
                  checked={radioVal === "prod"}
                  onChange={setRadioVal}
                />
                <Radio
                  name="env"
                  value="staging"
                  label="Staging"
                  checked={radioVal === "staging"}
                  onChange={setRadioVal}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: BADGES, STATUS PILLS & DATA DISPLAY */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
          4. Badges, Status Pills & Micro Data
        </h2>
        <div className="p-5 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="neutral">Neutral</Badge>
            <Badge variant="accent">Accent Cobalt</Badge>
            <Badge variant="success">Active</Badge>
            <Badge variant="warning">Trial Expiring</Badge>
            <Badge variant="danger">Suspended</Badge>
            <Badge variant="info">Read-Only</Badge>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-[var(--platform-border-subtle)]">
            <StatusPill status="active" label="Operational" pulse />
            <StatusPill status="past_due" label="Past Due (3d)" />
            <StatusPill status="suspended" label="Suspended" />
            <StatusPill status="trial" label="Free Trial (8d left)" />
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-[var(--platform-border-subtle)]">
            <CopyChip value="ten_65a7f93c001a" label="Copy Tenant ID" prefix="ID:" />
            <CopyChip value="titan-fitness" prefix="slug:" />
            <div className="flex items-center gap-1">
              <span className="text-xs text-[var(--platform-text-muted)]">Shortcut:</span>
              <Kbd>Cmd</Kbd>
              <Kbd>K</Kbd>
            </div>
            <Avatar name="Sarah Jenkins" status="online" />
            <Avatar name="Ahmed Mostafa" status="busy" />
          </div>

          <div className="pt-3 border-t border-[var(--platform-border-subtle)] max-w-md">
            <UsageMeter label="Member Capacity" current={420} max={500} unit="members" />
          </div>
        </div>
      </section>

      {/* SECTION 5: FEEDBACK, OVERLAYS & TOASTS */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
          5. Feedback, Modals, Overlays & Toasts
        </h2>
        <div className="p-5 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)] space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => setIsDialogOpen(true)}>
              Open Demo Dialog
            </Button>
            <Button variant="outline" onClick={() => setIsDrawerOpen(true)}>
              Open Demo Drawer
            </Button>
            <Button
              variant="secondary"
              onClick={() => platformToast.success("Invoice #INV-2026-001 downloaded successfully")}
            >
              Trigger Success Toast
            </Button>
            <Button
              variant="danger-outline"
              onClick={() => platformToast.error("Failed to recompute daily snapshot")}
            >
              Trigger Error Toast
            </Button>

            <Tooltip content="Deterministic ledger verification timestamp">
              <Button size="sm" variant="ghost">Hover for Tooltip</Button>
            </Tooltip>

            <DropdownMenu
              trigger={<Button size="sm" variant="secondary">Dropdown Menu ▾</Button>}
              items={[
                { header: true, label: "Operator Actions" },
                { label: "View Profile", icon: ExternalLink },
                { label: "Download Audit JSON", icon: Download },
                { divider: true },
                { label: "Revoke Session", danger: true, icon: Trash2 },
              ]}
            />
          </div>

          <div className="space-y-3 pt-3 border-t border-[var(--platform-border-subtle)]">
            <Callout variant="info" title="Audited Impersonation Gate">
              Launching a session generates a time-limited 30-minute JWT tagged with your operator ID.
            </Callout>
            <Callout variant="warning" title="Global Maintenance Mode">
              All tenant mutating actions are blocked while this maintenance window is active.
            </Callout>
          </div>
        </div>
      </section>

      {/* SECTION 6: TABS & DATA STATES */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--platform-text-muted)]">
          6. Tabs & Data States (Empty, Error, NoPermission)
        </h2>
        <div className="p-5 rounded-[var(--platform-radius-lg)] border border-[var(--platform-border)] bg-[var(--platform-surface)]">
          <Tabs defaultValue="empty">
            <TabsList>
              <TabTrigger value="empty">Empty State</TabTrigger>
              <TabTrigger value="error">Error State</TabTrigger>
              <TabTrigger value="forbidden">No Permission</TabTrigger>
            </TabsList>

            <TabContent value="empty">
              <EmptyState
                title="No subscribers found"
                description="No gyms match the selected lifecycle filter. Try relaxing your search terms."
                action={<Button size="sm" variant="outline">Reset Filters</Button>}
              />
            </TabContent>

            <TabContent value="error">
              <ErrorState
                title="Telemetry Cluster Unreachable"
                message="The platform monitoring endpoint timed out after 30 seconds."
                onRetry={() => platformToast.info("Retrying cluster ping...")}
              />
            </TabContent>

            <TabContent value="forbidden">
              <NoPermission requiredPermission="billing.refunds" />
            </TabContent>
          </Tabs>

          <div className="pt-4 border-t border-[var(--platform-border-subtle)] mt-4">
            <Pagination
              page={page}
              limit={20}
              total={128}
              onPageChange={setPage}
            />
          </div>
        </div>
      </section>

      {/* Demo Dialog Modal */}
      <Dialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title="Confirm Plan Deactivation"
        description="This action will prevent new subscribers from purchasing this commercial plan tier."
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                platformToast.success("Plan tier archived");
                setIsDialogOpen(false);
              }}
            >
              Confirm Deactivation
            </Button>
          </>
        }
      >
        <p>
          Existing active subscribers currently on this tier will maintain their current billing cycle
          until renewed or migrated.
        </p>
      </Dialog>

      {/* Demo Drawer Modal */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Gym Telemetry Inspector"
        description="Live diagnostics for /titan-fitness"
        footer={
          <Button variant="primary" onClick={() => setIsDrawerOpen(false)}>
            Close Inspector
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="p-3 rounded-[var(--platform-radius-md)] bg-[var(--platform-surface-subtle)] border border-[var(--platform-border-subtle)]">
            <div className="text-[11px] text-[var(--platform-text-muted)]">Active Database Node</div>
            <div className="font-semibold text-[var(--platform-text-primary)] mt-0.5">cluster0-shard-00-01</div>
          </div>
          <UsageMeter label="Storage Usage" current={14.2} max={25} unit="GB" />
          <UsageMeter label="Monthly WhatsApp Deliveries" current={3450} max={5000} unit="messages" />
        </div>
      </Drawer>
    </div>
  );
}
