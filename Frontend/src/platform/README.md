# Platform V2 Console Architecture & Conventions

Welcome to the brand-new Super Admin Platform Console frontend (`/platform/*`, transitioning to `/platform/*` upon cutover).

## Core Principles
1. **Zero Tenant Contamination:** Never import tenant gym colors (`#44298C`, gym purple), tenant stylesheets, or tenant components. The platform console exists in a completely isolated design system.
2. **Tabular-Numeric Precision:** All numbers, currencies, counts, UUIDs, slugs, timestamps, and IP addresses use `Geist Mono` (`tabular-nums`) with right alignment where appropriate.
3. **Hairline Surface Architecture:** 1px borders with subtle tone-on-tone surface steps replace heavy drop shadows and noisy decorative gradients.
4. **Mandatory Reason & Governance:** All destructive, financial, or lifecycle mutations strictly require an audit `reason`. Purge operations strictly enforce typed slug matching.
5. **No Direct Copying from Legacy Console:** Clean, typed, accessible, modern primitives built from scratch.

## Directory Structure
- `lib/api/`: Typed client with Axios interceptors, refresh token rotation, 401/403 handlers, and TanStack Query client.
- `lib/auth/`: Platform authentication context (`PlatformAuthProvider`), session storage, and fine-grained RBAC hooks (`usePermission`, `<Can>`).
- `lib/theme/`: Theme context supporting System, Light, and Dark modes, plus Comfortable vs. Compact density toggle.
- `lib/utils/`: Formatters (currency with dynamic code, relative/absolute dates, byte sizes, CSV generator).
- `ui/`: Accessible component primitives built with full keyboard accessibility, focus visible rings, and all interaction states.
- `shell/`: App shell including collapsible sidebar, sticky topbar with breadcrumbs & global search, command palette (`Cmd+K`), impersonation banner, and maintenance gate banner.
- `routes/`: Routing definition mounted under `/platform/*`.
- `features/`: Module features (Dashboard, Tenants, Billing, Support, etc.) and dev-only living style guide (`/platform/_design`).
