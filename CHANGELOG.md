# Changelog

All notable changes to the Leap Gym Multi-Tenant SaaS platform are documented in this file.

## [Unreleased] - 2026-11-07

### Added
- **Gym business intelligence snapshots**:
  - Daily tenant snapshots for membership, check-ins, PT, funnel counts, renewals, and churn, computed in integer piasters from `pricePaid` and `packageSnapshot`.
  - Role dashboards at `/analytics`, SMART goals, and rule-based insights for Platinum.
  - Gold plans include the `funnels` feature. Operational revenue for accountants uses the `accounting` feature.
  - Snapshot backfill: `node src/scripts/backfillBiSnapshots.js --dry-run --from YYYY-MM-DD --to YYYY-MM-DD`.
  - Guides in `docs/BUSINESS_INTELLIGENCE.md` and `docs/HOW_TO_USE_ANALYTICS.md`.
- Platform snapshot definitions now record same-day tenant churn, new tenants, and a tenant health score. Net revenue retention stays blank until monthly history exists. Staff activity updates `lastActivityAt`.
- **Unified Error Handling & Informative Modal System (Phases 0-5)**:
  - Defined universal error response envelope `{ error: { code, message, status, requestId, details, fieldErrors, retryAfter, docsKey } }` with transitional backward-compatibility fields.
  - Implemented `AppError` class hierarchy (`ValidationError`, `AuthError`, `ForbiddenError`, `FeatureNotInPlanError`, `PlanLimitError`, `SubscriptionError`, `NotFoundError`, `ConflictError`, `RateLimitError`, `PaymentError`, `UploadError`, `MaintenanceError`, `UpstreamError`, `InternalError`).
  - Added single source of truth `ERROR_CODES` covering Auth, Tenant/Subscription, Billing, Front Desk Check-in, Data/Conflict, Files/Imports, Platform Operations, and System/Network.
  - Built central Express error middleware in `errorHandler.js` converting Zod, Mongo duplicate key (11000), CastError, JWT, Multer, and unknown exceptions without leaking server internals, stack traces, or credentials.
  - Added request ID tracking with `req_...` format and sanitized logging in `requestLogger.js` and `sanitizeLog.js` (redacting passwords, tokens, secrets, PII, and cards).
  - Added process-level safety in `server.js` (`unhandledRejection`, `uncaughtException`), 404 handler (`ROUTE_NOT_FOUND`), and JSON parse error handler (`INVALID_JSON`).
  - Built frontend error normalization engine `normalizeError(err)` producing consistent `AppErrorView` across network offline, timeouts, aborts, and HTML responses.
  - Built central i18n-ready message catalog `ERROR_MESSAGES` with placeholder interpolation and clear user-facing next actions.
  - Added `<GlobalErrorContainer>` and dedicated accessible modal dialogs (`ErrorModal`, `UpgradeRequiredModal`, `SessionExpiredModal`, `RateLimitedModal`, `ConflictModal`, `ImportErrorsModal`, `PaymentFailedModal`, `OfflineBanner`, `GlobalStatusBanner`).
  - Added granular React error boundaries (`ErrorBoundary` and `WidgetErrorBoundary`) with Vite dynamic chunk-loading failure recovery.
  - Integrated Axios interceptors across Tenant and Platform apps with 4-second deduplication, `skipGlobalError: true`, and elimination of double-toast bugs.
  - Added comprehensive test suites (`errorHandler.test.js`, `sanitizeLog.test.js`, `errorHandlingContract.test.js`) verifying 172 backend tests pass.
  - Created complete architectural documentation in `docs/ERROR_HANDLING.md`.

## [1.1.0] - 2026-11-05

### Added
- **Lifetime Billing Cycle Option**:
  - Added perpetual lifetime purchase option for `basic`, `gold`, and `platinum` plans without altering base plan tier keys.
  - Implemented standalone `PlanPrice` collection with promotional validity windows (`validFrom`, `validUntil`), seat caps (`maxLifetimeSeats`), and atomic counters (`soldLifetimeSeats`).
  - Added append-only `BillingEvent` platform ledger with schema-level mutation guards (`updateOne`, `deleteMany`, etc. blocked).
  - Added `billing` subdocument on `Tenant` schema with `cycle`, `lifetime` details, `entitlementPolicy` (`follow_tier` | `snapshot`), and fair-use meters.
  - Added payment adapter interface with `ManualTransferAdapter` (bank transfer / escrow deposit) and `OnlinePaymentAdapterStub`.
  - Added tenant endpoints: `GET /api/tenant/billing/prices`, `POST /api/tenant/billing/lifetime/checkout`, `POST /api/tenant/billing/lifetime/confirm`, and `POST /api/tenant/billing/lifetime/upgrade`.
  - Added platform admin endpoints: `POST /api/platform/tenants/:id/lifetime/grant`, `POST /api/platform/tenants/:id/lifetime/revoke`, `PATCH /api/platform/tenants/:id/entitlement-policy`, `GET /api/platform/billing-events`, `GET/POST/PATCH /api/platform/plan-prices`.
  - Added UI components: `LifetimeCheckoutModal` and `LifetimeUpgradeModal` with explicit terms acceptance checkbox (`lifetimeTermsVersion: "2026.1"`).
  - Added "Plan & Usage" dashboard enhancements: Lifetime badge, no expiration date for lifetime, fair-use meters (storage GB & WhatsApp monthly quota), and dynamic upgrade triggers.
  - Added migration script `migrateAddLifetimeBilling` with `--dry-run` support, backfill verification, and automatic migration of the founding Leap Gym tenant to Platinum Lifetime.
  - Added comprehensive test suite `lifetimeBilling.test.js` (13 tests) verifying time-travel non-expiry, cron skip safeguards, entitlement snapshot vs follow_tier, seat cap race conditions, upgrade math, revocation, client tampering, and ledger immutability.
