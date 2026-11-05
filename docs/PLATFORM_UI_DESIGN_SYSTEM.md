# Super Admin Platform Console Design System Specification

## 1. Executive Summary & Design Direction

The **Super Admin Platform Console** (`/platform-next/*`, cutover to `/platform/*`) is the mission-critical back-office used by SaaS operators to oversee subscriber gyms, commercial tiers, recurring billing, ledger transactions, platform telemetry, and governance.

### Core Philosophy
- **Calm, Precise, and Information-Dense:** Built to the visual and UX standard of Stripe Dashboard, Linear, Vercel, and Attio. No noisy decorations, cartoonish illustrations, or gratuitous heavy drop shadows.
- **Strict Brand Isolation:** Completely decoupled from tenant gym branding. The console never loads tenant colors (`#44298C`, gym purple) or tenant logos. It operates in an authoritative neutral slate palette with a single restrained brand accent: **Precision Cobalt** (`#2563EB` light, `#3B82F6` dark).
- **Tabular-Numeric Clarity:** Every dollar amount, count, IP address, UUID, slug, and timestamp uses tabular numerals (`tabular-nums`) and clean monospace (`Geist Mono`) for alignment and rapid scanning.
- **Hairline Surface Architecture:** 1px hairline borders (`--platform-border: #e2e8f0` light, `#27272a` dark) and subtle elevation steps replace heavy drop shadows.

---

## 2. Design Tokens & Theme Specification

Implemented in [`Frontend/src/platform-v2/styles/platform-tokens.css`](file:///d:/Work/Fouda/leap/Frontend/src/platform-v2/styles/platform-tokens.css) and wired into Tailwind CSS 4 in [`Frontend/src/index.css`](file:///d:/Work/Fouda/leap/Frontend/src/index.css).

### Color Ramps & Semantic Aliases

| Token | Light Theme | Dark Theme | Purpose |
|---|---|---|---|
| `--platform-canvas` | `#f8fafc` (slate-50) | `#09090b` (zinc-950) | App workspace canvas background |
| `--platform-surface` | `#ffffff` | `#121215` | Cards, tables, data panels |
| `--platform-surface-raised` | `#ffffff` | `#18181b` (zinc-900) | Dialogs, sheets, popovers |
| `--platform-surface-subtle` | `#f1f5f9` (slate-100) | `#1f1f23` | Table headers, chip backgrounds |
| `--platform-border` | `#e2e8f0` (slate-200) | `#27272a` (zinc-800) | 1px hairline container borders |
| `--platform-border-subtle`| `#f1f5f9` (slate-100) | `#1a1a1e` | Nested row dividers |
| `--platform-border-strong`| `#cbd5e1` (slate-300) | `#3f3f46` (zinc-700) | Input hover and active boundaries |
| `--platform-text-primary` | `#0f172a` (slate-900) | `#f8fafc` (slate-50) | High-contrast headings and data |
| `--platform-text-secondary`| `#475569` (slate-600) | `#94a3b8` (slate-400)| Form labels, meta explanations |
| `--platform-text-muted` | `#64748b` (slate-500) | `#71717a` (zinc-500)| Timestamps, tabular units |
| `--platform-accent` | `#2563eb` (blue-600) | `#3b82f6` (blue-500) | Precision Cobalt primary actions |
| `--platform-success` | `#059669` (emerald-600)| `#10b981` (emerald-500)| Active states, paid invoices |
| `--platform-warning` | `#d97706` (amber-600) | `#f59e0b` (amber-500) | Approaching limits, trial expiring |
| `--platform-danger` | `#dc2626` (rose-600) | `#f43f5e` (rose-500) | Purge, suspend, destructive actions|

### Typography Scale
- **Primary UI Sans:** `Geist Sans` (`"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`)
- **Code & Numbers Sans:** `Geist Mono` (`"Geist Mono", monospace`) with `tabular-nums`
- **Scale:**
  - `Display / KPI Value`: 28px (`1.75rem`), font-weight 600, tracking -0.03em
  - `Page Title`: 18px (`1.125rem`), font-weight 600, tracking -0.02em
  - `Section Header`: 14px (`0.875rem`), font-weight 600, tracking -0.01em
  - `Body / Cell Text`: 13px (`0.8125rem`), font-weight 400, line-height 1.45
  - `Meta / Caption`: 11px (`0.6875rem`), font-weight 500, font-mono
  - `Micro Badges / Kbd`: 10px (`0.625rem`), font-weight 600, uppercase, tracking +0.04em

### Density Modes
Controlled via `data-platform-density="comfortable|compact"` on the `.platform-root` DOM node and persisted in `localStorage` under `platform_density`:
- **Comfortable Mode:** Default spacing (table cell padding `10px 16px`, form element height `36px`, card padding `20px`).
- **Compact Mode:** High-density operations view (table cell padding `6px 12px`, form element height `30px`, card padding `14px`, 12px table typography).

---

## 3. Accessible Component Library Catalog

All primitives reside in [`Frontend/src/platform-v2/ui/`](file:///d:/Work/Fouda/leap/Frontend/src/platform-v2/ui/):

1. **Button:** `primary`, `secondary`, `outline`, `ghost`, `danger`, `danger-outline` with sizes `xs`, `sm`, `md`, `lg`, loading spinner, and icon slots.
2. **Input & Textarea:** With left/right icons, monospace mode, character counters, validation errors, and helper text.
3. **Select & Combobox:** Keyboard-navigable accessible selects and searchable autocomplete dropdowns.
4. **Checkbox, Radio & Switch:** Accessible toggle controls with label and description slots.
5. **Badge & StatusPill:** Status indicators with live pulsating dot option for realtime telemetry.
6. **Tooltip & Popover:** Lightweight floating overlays with escape key dismiss and focus management.
7. **DropdownMenu:** Menus with dividers, headers, danger items, and keyboard arrow navigation.
8. **Dialog & Drawer:** Modals with backdrop blur, focus trap, and side sliding drawer for record inspection.
9. **Toast:** Themed notifications using `platformToast.success()`, `error()`, `warning()`, and `info()`.
10. **Skeleton & Avatar:** Shimmer placeholders matching exact component dimensions, and deterministic operator initials.
11. **Breadcrumbs & Pagination:** Navigable path breadcrumbs and full server-side pagination with item range display.
12. **UsageMeter:** Capacity utilization bar with color-coded safety tiers (normal, warning at 80%, danger at 100%+).
13. **Callout & Kbd:** Inline contextual callout boxes and micro keyboard shortcut keycaps.
14. **CopyChip:** 1-click clipboard copy chip with visual feedback for IDs, slugs, and hashes.
15. **Tabs & DateRangePicker:** Filter tabs and date range picker with instant presets ("Today", "Last 7 Days", "Last 30 Days", "This Month").
16. **EmptyState, ErrorState & NoPermission:** Consistent states for empty queries, network errors, and 403 access restrictions.

---

## 4. Shell & High-Order Patterns

All shell components reside in [`Frontend/src/platform-v2/shell/`](file:///d:/Work/Fouda/leap/Frontend/src/platform-v2/shell/):

1. **App Shell (`PlatformShell.jsx`):** Collapsible sidebar, sticky topbar with breadcrumbs, density toggle, theme toggle, and operator menu.
2. **Command Palette (`CommandPalette.jsx`):** Global quick switcher (`Cmd+K` or `Ctrl+K`) for jumping to pages, searching subscribers by name/slug/email, and inspecting shortcuts via `?`.
3. **Impersonation Banner (`ImpersonationBanner.jsx`):** Persistent 30-minute countdown banner displaying active tenant name, read-only mode badge, and 1-click exit action.
4. **Maintenance Gate Banner (`MaintenanceBanner.jsx`):** Live warning banner displaying operator maintenance reason and direct link to the maintenance gate.
5. **DataTable Pattern (`DataTable.jsx`):** Sticky header, server-side pagination/sort/filter, column visibility toggle, multi-row bulk selection, and CSV export.
6. **KpiCard & ChartCard Pattern:** Tabular metric cards with sparklines, trend deltas, and "how calculated" definition popovers.
7. **Form Layout Pattern (`FormLayout.jsx`):** Sectioned forms with inline validation, unsaved changes alert, and sticky save bar.
8. **ConfirmDialog Pattern (`ConfirmDialog.jsx`):** Destructive confirmation requiring mandatory audit reason and exact typed slug confirmation for hard purge.

---

## 5. Living Style Guide

Explore all tokens, components, and patterns live in the browser at:
`/platform-next/_design`
