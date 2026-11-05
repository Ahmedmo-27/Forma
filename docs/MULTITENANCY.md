# Leap Gym Multi-Tenant SaaS Architecture Documentation

## 1. Executive Summary & Overview
The **Leap Gym Management System** (formerly single-tenant Flame Factory) has been transformed into a **shared-database multi-tenant SaaS**. 
In this architecture, each gym operates as an isolated subscriber ("tenant") with its own:
- Subscription Plan (`basic`, `gold`, `platinum`) and quota limits (`maxMembers`, `maxStaff`, `maxBranches`).
- Feature flags controlling access to backend routes and UI navigation modules.
- Brand identity (custom display name, logo upload, and dynamic 5-color palette injected into CSS tokens).
- Regional settings (currency, timezone, language, and enabled activity offerings).
- Isolated file storage partitions (`uploads/{tenantId}/...`) and encrypted secrets at rest.
- Dedicated atomic counter sequences for human-readable IDs (`systemId`, `memberId`, `contractNumber`).

---

## 2. Core Tenant Isolation Guarantees

### 2.1 Context Isolation via `AsyncLocalStorage`
- Every request entering the system resolves the tenant identity from:
  1. The cryptographically verified JWT payload (`user.tenantId`, `user.tenantSlug`).
  2. The subdomain (e.g. `leap.leapgym.com` → slug `leap`).
  3. The `X-Tenant-Slug` request header or `gymCode` body parameter during login.
- **Rule of Engagement:** The system **never** trusts `tenantId` passed in request bodies, query strings, or URL parameters for queries. It is established exclusively by the authentication middleware and stored in Node.js `AsyncLocalStorage` (`tenantContext.js`).

### 2.2 Schema-Level Mongoose Plugin (`tenantPlugin.js`)
All tenant-owned models apply `tenantPlugin`:
1. **Required Schema Attribute:** Automatically injects `{ tenantId: { type: ObjectId, ref: 'Tenant', required: true, index: true } }`.
2. **Read Scoping:** Injects `{ tenantId }` into query conditions for `find`, `findOne`, `findOneAndUpdate`, `updateOne`, `updateMany`, `deleteOne`, `deleteMany`, and `countDocuments`.
3. **Aggregation Scoping:** Intercepts `aggregate()` and prepends a `$match: { tenantId }` stage to the pipeline.
4. **Creation Stamping:** Automatically stamps `tenantId` in `pre('save')` and `insertMany` hooks.
5. **Fail-Closed Protection:** If any tenant-scoped model query executes without an active tenant context, `tenantPlugin` **throws a `TenantContextMissingError` immediately**, preventing accidental global execution or data exposure.

### 2.3 Platform Admin Escape Hatch (`runAsPlatform`)
- Platform-level tasks (such as background cron workers, cross-tenant system metrics, and seed scripts) execute inside `runAsPlatform(fn)`.
- Bypasses query scoping safely while logging an audit trail (`[platform] runAsPlatform invoked`).

---

## 3. Data Models & Schemas

### 3.1 `Plan` (Platform-Level)
| Field | Type | Description |
|---|---|---|
| `key` | String (unique) | `basic` \| `gold` \| `platinum` |
| `name` | String | Display name (e.g. "Gold Plan") |
| `priceMonthly` | Number | Monthly price |
| `priceYearly` | Number | Annual discount price |
| `currency` | String | Billing currency (e.g. "USD", "EGP") |
| `features` | [String] | Array of feature keys enabled |
| `allowedRoles` | [String] | Staff roles permitted under this plan |
| `limits` | Object | `{ maxMembers, maxStaff, maxBranches }` |
| `isActive` | Boolean | Whether new tenants can subscribe |

### 3.2 `Tenant` (Platform-Level)
| Field | Type | Description |
|---|---|---|
| `name` | String | Gym official legal name |
| `slug` | String (unique) | Subdomain identifier (e.g. `leap`) |
| `status` | String | `trial` \| `active` \| `past_due` \| `suspended` \| `cancelled` |
| `planId` | ObjectId (ref Plan) | Subscribed tier |
| `featureOverrides` | Object | `{ add: [String], remove: [String] }` |
| `limitOverrides` | Object | `{ maxMembers, maxStaff, maxBranches }` |
| `trialEndsAt` | Date | Trial expiration timestamp |
| `ownerUserId` | ObjectId (ref User) | Primary gym administrator |
| `settings` | Subdocument | Embedded tenant settings (branding, locale, activities, WhatsApp) |

### 3.3 Embedded Settings & Encryption at Rest
Tenant settings are stored as an embedded subdocument for fast lookup:
- **Branding:** `{ displayName, logoKey, palette: { primary, secondary, accent, background, text } }`.
- **Locale:** `{ currency, timezone, language }`.
- **Enabled Activities:** Array of activity strings (e.g. `['gym', 'crossfit', 'mma', 'pilates']`).
- **WhatsApp Cloud API:** Phone number ID, WABA ID, and `accessToken`. The `accessToken` is encrypted at rest using **AES-256-GCM** via `tenantCrypto.js` with `TENANT_SECRET_KEY`. It is **never returned in API responses**.

---

## 4. Compound Indexes & Atomic Sequences

### 4.1 Zero-Downtime Index Redesign
Global unique indexes have been migrated to compound per-tenant indexes with `tenantId` as the leading prefix:
- `users`: `{ tenantId: 1, email: 1 }` (unique)
- `members`: 
  - `{ tenantId: 1, memberId: 1 }` (unique, `partialFilterExpression: { memberId: { $type: "number" } }`)
  - `{ tenantId: 1, barcode: 1 }` (unique, `partialFilterExpression: { barcode: { $type: "string" } }`)
  - `{ tenantId: 1, nationalId: 1 }`, `{ tenantId: 1, status: 1 }`, `{ tenantId: 1, assignedSales: 1 }`
- `packages`: `{ tenantId: 1, name: 1, duration: 1 }` (unique)
- `counters`: `{ tenantId: 1, name: 1 }` (unique)

### 4.2 Per-Tenant Atomic Sequences (`Counter`)
Human-readable incremental IDs (`systemId`, `memberId`, `contractNumber`) are generated via MongoDB's atomic `findOneAndUpdate` with `$inc: { seq: 1 }` and `upsert: true` partitioned by `{ tenantId, name }`. This guarantees gap-free sequences isolated between gyms.

---

## 5. Feature & Role Gating Matrix

| Feature Key | Basic Plan | Gold Plan | Platinum Plan |
|---|:---:|:---:|:---:|
| `members` | ✅ | ✅ | ✅ |
| `checkin` | ✅ | ✅ | ✅ |
| `packages` | ✅ | ✅ | ✅ |
| `pt_tracking` | ✅ | ✅ | ✅ |
| `audit` | ✅ | ✅ | ✅ |
| `accounting` | ❌ | ✅ | ✅ |
| `exception_approvals` | ❌ | ✅ | ✅ |
| `sales_crm` | ❌ | ✅ | ✅ |
| `whatsapp` | ❌ | ✅ | ✅ |
| `excel_import` | ❌ | ✅ | ✅ |
| `exec_analytics` | ❌ | ❌ | ✅ |
| `funnels` | ❌ | ❌ | ✅ |
| `business_intelligence` | ❌ | ❌ | ✅ |

### Permitted Roles:
- **Basic:** `Owner`, `Receptionist`, `Coach`, `Coach Manager`.
- **Gold:** Basic roles + `Accountant`, `Sales Manager`, `Sales Rep`.
- **Platinum:** All roles.

### 4-Eyes Exception Approval Fallback:
On plans lacking an `Accountant` role (e.g. Basic), the `Owner` is authorized to view, review, and approve `PackageExceptionRequest`s.

---

## 6. File Storage & PII Partitioning
- Uploaded member photos, IDs, contract files, and logos are organized into isolated directories:
  ```
  uploads/
    ├── {tenantId_A}/
    │     ├── photo-1.jpg
    │     └── logo-123.png
    └── {tenantId_B}/
          ├── photo-2.jpg
          └── logo-456.png
  ```
- Handled through `storageService.js` (abstraction ready for local disk or S3/Cloudflare R2).
- Route `/uploads/:filename` checks `canAccessMemberUpload()`:
  - Asserts `member.tenantId === req.user.tenantId`. Cross-tenant file requests return HTTP 404.
  - Verifies magic byte file signatures to block polyglot uploads.

---

## 7. Platform Admin & Operations

Platform admins are distinct identities (`PlatformAdmin` model) authenticated with `audience: "leap-platform-admin"`.

### Endpoints (`/api/platform/*`):
- `POST /api/platform/auth/login`: Admin authentication.
- `GET/POST /api/platform/plans`: Manage plan tiers.
- `GET/POST /api/platform/tenants`: List and provision tenants.
- `PATCH /api/platform/tenants/:id`: Update status, plan, and feature/quota overrides.
- `POST /api/platform/tenants/:id/impersonate`: Issue a temporary support token; writes an entry to `AuditLog`.

---

## 8. Gym Onboarding Guide (Step-by-Step)

### Step 1: Seed Platform Plans
Run the idempotent plan seed script:
```bash
npm --prefix Backend run seed:plans
```
This populates `basic`, `gold`, and `platinum` plans in MongoDB.

### Step 2: Create a New Tenant via Platform API
Send a request to `/api/platform/tenants`:
```http
POST /api/platform/tenants
Authorization: Bearer <PLATFORM_ADMIN_TOKEN>
Content-Type: application/json

{
  "name": "Spartan Gym",
  "slug": "spartan",
  "planKey": "gold",
  "settings": {
    "branding": {
      "displayName": "Spartan Fitness",
      "palette": {
        "primary": "#DC2626",
        "secondary": "#991B1B",
        "accent": "#EF4444",
        "background": "#F9FAFB",
        "text": "#111827"
      }
    },
    "locale": {
      "currency": "EGP",
      "timezone": "Africa/Cairo",
      "language": "en"
    },
    "enabledActivities": ["gym", "crossfit", "box"]
  }
}
```

### Step 3: Create Gym Owner Account
Create the initial Owner user assigned to the new tenant:
```bash
node -e "
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: 'Backend/.env' });
const User = require('./Backend/src/models/User');

async function createOwner() {
  await mongoose.connect(process.env.MONGO_URI);
  const hash = await bcrypt.hash('SpartanAdmin2026!', 10);
  const owner = await User.create({
    name: 'Leonidas Spartan',
    email: 'owner@spartan.com',
    password: hash,
    role: 'Owner',
    tenantId: 'THE_TENANT_OBJECT_ID_FROM_STEP_2'
  });
  console.log('Created owner:', owner._id);
  process.exit(0);
}
createOwner();
"
```

### Step 4: Login to the Gym Workspace
Staff and owners can log in via:
1. Entering gym code `spartan` in the Login page form.
2. Navigating to the subdomain `spartan.leapgym.com`.
3. Client automatically resolves the tenant, applies the dynamic Red palette, renders the Spartan logo, and displays enabled features.

---

## 9. Verification & Maintenance Commands

### Run Full Backend Test Suite (91 tests):
```bash
npm --prefix Backend test
```

### Run Fast-Check Property Isolation Tests:
```bash
npx vitest run Backend/src/tests/isolationProperty.test.js
```

### Run Package Price Immutability Simulation:
```bash
npm --prefix Backend run simulate:package-immutability
```

### Run Frontend Production Build:
```bash
npm --prefix Frontend run build
```

### Run Live Tenant Data Migration:
```bash
# Dry run (prints pending updates without writing)
node Backend/src/scripts/migrateToMultitenant.js --dry-run

# Live execution
npm --prefix Backend run migrate:multitenant
```
