# Changelog

All notable changes to the Leap Gym Multi-Tenant SaaS platform are documented in this file.

## [Unreleased] - 2026-11-05

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
