# Leap Gym QA report

Date: 6 Nov 2026. Read-only on source. No production Render API was written.

## Environment

| Item | What was used |
|---|---|
| Database | MongoDB Atlas, database name `test`, host `cluster0.o19mzyx.mongodb.net`. Not localhost. One pre-existing gym (`slug=leap`, created 5 Nov 2026) plus the seed super admin. Treated as the dev database. The existing gym's members were not edited. |
| API | Local Express on `http://127.0.0.1:5000` (`npm run dev` in `Backend`). |
| UI | Vite on `http://localhost:5174` with `BACKEND_ORIGIN=http://localhost:5000`. Port 5173 was already taken. `Frontend/.env` is committed and points at `https://leap-backend-d4s3.onrender.com`; that file was not used for this run. |
| Browser | Cursor browser, 1440×900 and 390×844. |
| Screenshots | `qa-evidence/` |

If this Atlas `test` database is actually shared with the Render service, the `qa-*` rows below are in that same database and should be deleted.

---

## 1. Executive summary

**Readiness: 4 / 10.**

A gym cannot be onboarded through the product as it behaves today. Creating a tenant, an owner, and an invite all succeed in the database, then the request returns **500** because the platform audit write requires a `tenantId`. With SMTP unset, the invite link exists only in that failed response, so the owner never gets a password. The same audit bug returns 500 when creating platform operators, after the operator account has already been saved.

Billing math is not safe to show a customer: lifetime purchases in USD and EGP are added together and the dashboard prints the sum as dollars. There are ledger rows and **zero invoices**. The plans catalog itself is populated (the "0 features" screen was not reproduced on the real plans route). Feature gates, cross-tenant 404s, and read-only impersonation did work.

### Top 10

1. **Tenant onboard returns 500 after the gym and owner are created, and the invite link is discarded.** `POST /api/platform/tenants` for `qa-basic`, `qa-gold`, `qa-platinum`, `qa-lifetime`, and `qa-trial` all returned `AuditLog validation failed: tenantId: Path tenantId is required.` The tenants still exist.
2. **MFA is enrolled and ignored.** `GET /api/platform/auth/me` reports `mfaEnabled: true` for the super admin. `POST /api/platform/auth/login` still returns a full access token and refresh token. `login()` in `platformAuthController.js` never calls the MFA challenge.
3. **Platform operator create has the same 500-after-write bug.** `qa_billing@example.com`, `qa_support@example.com`, and `qa_analyst@example.com` were saved, then the API returned 500. A later login for those accounts succeeded.
4. **Revenue is wrong on the dashboard.** Lifetime capital and net revenue both show **$3,808**. The ledger is 2499 USD + 1299 USD + 10 EGP + a 0 USD grant, added as raw numbers and formatted as USD (`DashboardPage.jsx` hardcodes `"USD"`). Invoice collection count is 0.
5. **Changing a plan does not update the tenant session.** `GET /api/tenant/me` is cached `private, max-age=300`. After `change_plan` to platinum, the next call was `X-Cache: HIT` and still returned plan `basic`. Platform lifecycle invalidates only platform cache tags.
6. **Unknown console URLs redirect forever into a blank page.** `/platform/plans` does not match route `plans-features`. The catch-all is `<Navigate to="dashboard" />` (relative) in `PlatformRoutes.jsx` line 74, so the URL becomes `/platform/plans/dashboard/dashboard/...` and the content area is empty.
7. **A guest can check in through the API.** Creating a member with only a name and phone returns `status: "guest"` and no barcode. `POST /api/members/check-in` then returns 201. The check-in screen disables the button for guests (`CheckIn.jsx`), so the UI and API disagree.
8. **The existing gym is already outside its plan, and branch limits do nothing.** Tenant list for `leap`: plan gold, cycle lifetime, **owner null**, staff **21 / max 15**, members 37 / 1000. `maxBranches` is stored on the plan and never referenced by a route.
9. **You cannot sell or redeem the catalog the way the console implies.** Basic lifetime price is inactive, amount 499, currency USD, while monthly/yearly prices are EGP. There is no monthly checkout endpoint. `Coupon.redeemAtomic` is only called from a unit test; `POST /api/platform/coupons/redeem` is 404.
10. **Several failures show raw database errors, and maintenance mode does not stop the API.** Invalid tenant id `not-an-id` returns 500 with `Cast to ObjectId failed...`. Turning maintenance on left `GET /` and `GET /api/platform/plans` at 200.

---

## 2. Findings

| ID | Sev | Area | Title | Steps | Expected vs actual | Evidence | Suspected cause | Suggested fix |
|---|---|---|---|---|---|---|---|---|
| F01 | Critical | Platform | Onboarding 500 drops the invite | As super admin, `POST /api/platform/tenants` with name, slug `qa-basic`, owner email, `planKey=basic`. Repeat for gold, platinum, lifetime, trial. | 201 with invite URL. Actual: 500 `tenantId is required` on AuditLog. Rows exist. SMTP is unset, so no email. | Response body from local API. Tenants later listed by `GET /api/platform/tenants`. | `AuditLog` uses `tenantPlugin`, which requires `tenantId`. `onboardTenant` writes the audit log in platform context, where the plugin skips stamping, then throws before `res.status(201)`. | Make platform audit rows allowed without a tenant id, and write the audit after the response is guaranteed, or return the invite even if audit fails. Do not commit the tenant until the invite can be returned. |
| F02 | Critical | Security | MFA flag is not enforced | Login as the seeded super admin. Then `GET /api/platform/auth/me`. | Challenge required when `mfa.enabled` is true. Actual: login JSON keys are `message, token, refreshToken, user`. Me says `mfaEnabled: true`. UI reached `/platform/dashboard` with no code prompt. | API responses; dashboard screenshot `qa-evidence/qa-dashboard-1440.png`. | `login()` in `Backend/src/controllers/platformAuthController.js` issues tokens after the password matches and never reads `user.mfa.enabled`. A unit test is named "logs in directly without MFA". | Branch to the existing `/auth/mfa/challenge` flow when MFA is enabled, and issue only a short-lived temp token until the code matches. |
| F03 | Critical | Platform | Creating an operator returns 500 but keeps the user | `POST /api/platform/users` for billing, support, and analyst. | 201, or 500 with no user. Actual: 500 `AuditLog tenantId required`, then those emails log in. | `create-platform-billing` 500; later `qa_billing@example.com` login 200; user list shows three `example.com` operators. | `createPlatformUser` saves the user, then `AuditLog.create` throws. No transaction. | Same audit-schema fix as F01. Wrap create + audit in a transaction so a failed audit rolls the user back. |
| F04 | High | Data | Dashboard adds USD and EGP and labels both as dollars | Open `/platform/dashboard` after `POST /api/platform/analytics/snapshots/compute`. Compare with `GET /api/platform/billing/ledger`. | One currency, matching invoices. Actual: lifetime capital **$3,808** and net **$3,808**. Ledger events: purchase 2499 USD platinum, purchase 1299 USD gold, purchase 10 EGP gold, grant 0 USD. `invoices` total 0. | `qa-evidence/qa-dashboard-1440.png`. `computeDailySnapshot` adds `e.amount` with no currency conversion. `DashboardPage.jsx` calls `formatCurrency(..., "USD")`. | Snapshot sums every purchase amount. UI ignores `currency`. Historical purchases never created invoices. | Store money as integer minor units plus currency. Convert or refuse to sum mixed currencies. Format with the event currency. Generate the invoice in the same transaction as the ledger row. |
| F05 | High | Data | "Expiring trials (7 days)" shows every trial | Dashboard health card. | Count of trials ending within 7 days (`expiringTrialsCount` is computed). Actual: label says 7 days, value is `growth.trialTenants` (4, equal to every QA trial, including one ending 6 Dec). | Screenshot. `DashboardPage.jsx` around the "Expiring Trials (7 Days)" block uses `growth.trialTenants`. | Wrong field bound in the UI. The service does compute the 7-day count and the page never reads it. | Bind the card to `expiringTrialsCount`. |
| F06 | High | API | Plan change stays cached on the tenant for up to 5 minutes | Login as `qa-basic`. `GET /api/tenant/me` (MISS, plan basic). Platform `PATCH .../lifecycle` `change_plan` to platinum. `GET /api/tenant/me` again. | New plan immediately. Actual: `X-Cache: HIT`, `Cache-Control: private, max-age=300`, body plan still `basic`. | Probe result `stale-plan`. | `GET /api/tenant/me` uses `cacheResponse({ ttlSeconds: 300 })`. Lifecycle uses `autoInvalidate(["tenants","analytics"], "platform")`, which does not clear `tenant:{id}:tenant`. | Invalidate that tenant's `tenant` tag inside `updateTenantLifecycle`, and send `Cache-Control: private, no-store` on entitlement responses. |
| F07 | High | UX | Wildcard route blanks the console and grows the URL | While signed in, open `http://localhost:5174/platform/plans`. | Plans page, or a single redirect to a 404. Actual: relative `<Navigate to="dashboard">` appends `/dashboard` repeatedly. Content area is black/empty. Breadcrumb shows `plans / dashboard`. | `qa-evidence/qa-plans-redirect-loop.png`. `PlatformRoutes.jsx` line 74. Real page is `/platform/plans-features`. | Relative `Navigate` under a splat route re-matches the splat. | Navigate to `/platform/dashboard` (absolute) or render a not-found page. |
| F08 | High | Tenant | API checks in members who are not members | As `qa-basic` owner, `POST /api/members` `{name, phones}`. Then `POST /api/members/check-in` with the new id. | Reject until a package is active. Actual: create returns `status:"guest"`, `isMember:false`, no barcode, message "Guest added". Check-in returns 201 twice. Freeze returns 400 `Cannot freeze — member status is "guest"`. | Probe `create-member`, `checkin`, `freeze`. UI `canCheckIn` excludes `guest`. | `checkInMember` blocks `blocked` and `expired` only. It does not require `isMember` or an active subscription. | Reject check-in unless status is active (or the frozen early-end path). Align the button and the API. |
| F09 | High | Data | Live gym has no owner and is over the staff cap | `GET /api/platform/tenants`. | Owner populated; staff ≤ plan max, or an explicit over-limit state. Actual: `leap` owner `null`, cycle lifetime, plan gold, staff 21, maxStaff 15, members 37, maxMembers 1000. Dashboard lists "Leap Gym 140% capacity" (staff ratio). | Tenant list payload; dashboard screenshot. | Migration set lifetime gold without `ownerUserId`. Staff limit is only checked when creating staff (`enforceStaffLimit`), not against existing rows. | Backfill an owner. Surface over-cap as a billing/support alert. Decide whether existing staff are grandfathered. |
| F10 | High | Data | Prices are not one currency, and basic lifetime cannot be bought | `GET /api/platform/prices`. As a tenant, `POST /api/tenant/billing/lifetime/checkout` `{planKey:"basic"}`. | Every plan × cycle has an active price in EGP. Actual: monthly/yearly are EGP and active (1500/15000, 3500/35000, 6500/65000). Lifetime is USD: basic 499 **inactive**, gold 1299 cap 50 sold 1, platinum 2499 cap 25 sold 1. Checkout returns 404 `PRICE_NOT_FOUND`. | Price matrix from the database via the API. | `seedPlanPrices.js` copies plan currency for monthly/yearly and `lifetimePricing.json` for lifetime. Basic lifetime was turned off. There is no monthly checkout route, only lifetime. | One currency per catalog. Activate a price for every plan and cycle you sell. Add a monthly/yearly bank-transfer checkout, not only lifetime. |
| F11 | High | Platform | Coupons cannot be redeemed | `POST /api/platform/coupons` code `QA_SAVE10`. `POST /api/platform/coupons/redeem`. Search routes for `redeemAtomic`. | A checkout applies the coupon once. Actual: create 201. Redeem route 404 `ROUTE_NOT_FOUND`. `redeemAtomic` is only referenced from `platformPlansAndPricing.test.js`. | API 404. | Model method was never wired to billing checkout. | Call `redeemAtomic` inside checkout and reject reused or expired codes. |
| F12 | High | API | Failed requests leak Mongoose errors | `GET /api/platform/tenants/not-an-id`. `POST /api/platform/tenants` with `tags` as an object. | 400 with a safe message and request id. Actual: 500 `{message:"Server error", error:"Cast to ObjectId failed for value \"not-an-id\"..."}` and 500 `Cast to [string] failed ... tags.0`. | Probe `errors` and `inject-tenant`. | Controllers `res.status(500).json({ error: err.message })` instead of the shared error handler. | Validate ids before `findById`. Pass unknown errors to `errorHandler` and never return `err.message` for 500s. |
| F13 | High | Ops | Maintenance mode is only a setting | `POST /api/platform/system/maintenance` `{enabled:true}`. `GET /` and `GET /api/platform/plans`. Then disable it. | Tenant and maybe platform traffic blocked with the maintenance message. Actual: both GETs stayed 200. Setting was stored. It was turned back off. | Probe `maintenance`. | `toggleMaintenanceMode` writes `PlatformSetting` and does not install middleware that reads it. | A middleware that checks the flag and returns 503, with an allowlist for platform health. |
| F14 | Medium | Security | Authenticated responses are browser-cacheable | Any cached platform GET, e.g. `/api/platform/plans`. | `Cache-Control: private, no-store` for authorized JSON. Actual: `private, max-age=600` on plans, features, roles, prices; 180 on analytics; 60 on tenants; 300 on `/api/tenant/me`. | Response headers, `X-Cache: HIT` on the second features call. `apiCache.js` sets `private, max-age=${ttlSeconds}`. | Shared in-memory cache is separate from this header. The header lets the browser reuse a user's private JSON. | `no-store` on authorized responses. Keep the server cache if keys stay tenant-scoped. |
| F15 | Medium | Data | Non-lifetime fair-use numbers disagree with the plan card | Plans UI shows 25 GB and 2000 WhatsApp for Basic, Gold, and Platinum. `GET /api/tenant/me` on trial `qa-basic`. | The card and the tenant payload match the plan. Actual: me payload `limits.storageGb: 5`, `whatsappMonthlyMessages: 500`, and `usage.storageGb: 0.5` on a gym with no files. | Plans screenshot. `tenantController.js` lines that set non-lifetime caps to 5 and 500, and `usage.storageGb ?? 0.5`. | Hardcoded fallbacks, and a placeholder 0.5 when no usage document exists. | Read `plan.fairUseCaps`. Use 0 when usage is missing. |
| F16 | Medium | Data | Plan descriptions are empty | Open `/platform/plans-features`. | Each tier has a commercial description. Actual: all three cards say "No description provided for this tier." API `description` is `""`. | `qa-evidence/qa-plans-1440.png`. `PlansFeaturesPage.jsx` falls back to that sentence. Seed `seedPlans.js` never sets `description`. | Placeholder copy on empty string. | Seed real descriptions or hide the paragraph until one exists. |
| F17 | Medium | Data | Feature catalog "0" was not reproduced; keys do match | Open `/platform/plans-features`. `GET /api/platform/features`. Compare keys to plan.features. | The reported bug: Registered Features 0 and catalog 0 while plans show 5, 10, and 13 flags. Actual on this database: Registered Features **14**, catalog **14**, flags 10 / 13 / 5. Every plan key (`members`, `checkin`, `packages`, `pt_tracking`, `audit`, `accounting`, `exception_approvals`, `sales_crm`, `whatsapp`, `excel_import`, `exec_analytics`, `funnels`, `business_intelligence`) exists in the catalog. The 14th row is the QA feature created during this test. Descriptions and categories on the 13 defaults are filled. | Page text and `GET /features`. `ensureDefaultFeatures()` in `platformPlanController.js` inserts `DEFAULT_FEATURES` only when the collection count is 0. | The 0 was likely an empty `features` collection before the first successful `GET /features`, or the blank page from F07 if someone opened `/platform/plans`. It is not a key mismatch. | Call the seeder from `seed:plans`, not only lazily from the GET. |
| F18 | Medium | Platform | New plan keys are impossible | `POST /api/platform/plans` `{key:"qa_plan", ...}`. | A fourth commercial plan can be created from the button "New Subscription Plan". Actual: 400 `qa_plan is not a valid enum value for path key`. | API body. `Plan.js` `key.enum: ["basic","gold","platinum"]`. `createPlanSchema` has the same enum but is not mounted on the route. | Schema and Mongoose enum freeze the catalog. | Allow new keys, or remove the create button and the unused schema. |
| F19 | Medium | Platform | Coupon update is mass-assignment | `PATCH /api/platform/coupons/:id` with `redeemedCount: 999`. | Ignore server-owned fields. Actual: 200. Handler is `findByIdAndUpdate(id, req.body)`. | `updateCoupon` in `platformPlanController.js`. | Whole body is written. | Whitelist `isActive`, `expiresAt`, `maxRedemptions`. |
| F20 | Medium | Security | Suspended gym is fully locked, including reads | Suspend `qa-basic` with a reason. Call `GET /api/members` and `GET /api/tenant/me` with the owner token. Reactivate. | Spec text says mutations blocked. Actual: both 403 `TENANT_SUSPENDED` ("subscription is suspended or cancelled"). Owner cannot open the app to pay. | Probe `suspended`. `authMiddleware.js` returns 403 for any method when status is suspended or cancelled. | Stricter than the comment in `tenantStatus.js`, and it blocks the billing screen too. | Allow GET of billing and profile so the gym can pay. Keep mutations blocked. |
| F21 | Medium | Tenant | Trial expiry blocks the product but not `/api/tenant/me` | Set `qa-trial` `trialEndsAt` to yesterday (test row only), then restored it. | One consistent message. Actual: `GET /api/members` 403 `TRIAL_EXPIRED`. `GET /api/tenant/me` 200. | Probe `trial-expired`. Members routes use `enforceSubscriptionStatus`. Tenant `/me` does not. | Split middleware coverage. | Use the same guard on tenant routes, with an exception for checkout. |
| F22 | Medium | Tenant | `past_due` works on the API and cannot be set from the console | No lifecycle action exists. Directly set the QA trial tenant to `past_due`, then GET and POST a member, then restored `trial`. | Console can mark past due. Reads work, writes 403. Actual: `action: "past_due"` returns 400 `Unknown lifecycle action`. After a direct status write, GET members 200 and POST 403 `SUBSCRIPTION_PAST_DUE`. | Probe `no-past-due-action` and `past-due`. | State machine in the UI/API has no transition into `past_due`. The middleware itself is correct. | Add the action, or a job that sets it when the period ends. |
| F23 | Medium | Data | Lifetime seats do not match who is on lifetime | Compare seat counters to tenants. | Sold seats equal lifetime tenants per plan. Actual: gold sold 1, platinum sold 1. Current lifetime tenants seen in the list are `leap` (gold) and `qa-lifetime` (gold, amountPaid 10 EGP). No current tenant is platinum lifetime, but a 2499 USD platinum purchase is in the ledger. | Price matrix and billing events. Onboard's lifetime path writes a BillingEvent and does not go through `confirmLifetimePurchase`, which is what increments seats. | Two code paths. | One function updates tenant, ledger, seats, and invoice together. |
| F24 | Medium | Ops | Top bar always says Production | Look at the console header on localhost. | "Local" or the real `NODE_ENV`. Actual: the word Production is hardcoded. | Screenshot. `TopBar.jsx` `<span>Production</span>`. | Static label. | Drive it from the API environment. |
| F25 | Medium | UX | Plans page placeholder and a dead "—" | Plans cards. | Description, or no description block. Actual: "No description provided for this tier." A dash sits under the plan name with no label. | `qa-evidence/qa-plans-1440.png`. | Empty `description`; an empty visibility or price chip. | See F16. Give the dash an accessible name or remove it. |
| F26 | Low | API | Pagination rejects abuse by clamping, not by 400 | `GET /api/platform/tenants?limit=100000`, `page=-5&limit=-2`, `page=abc`, `sort[$ne]=1`, `search[$ne]=null`. | Cap, and do not interpret operators. Actual: 200. Limits became 100, 1, and 20. Negative page became 1. The operator query did not change the result set (still the normal list). | Probe `page *`. `pagination.js` `maxLimit` default 100. `search` is only used as a regex on name and slug when the controller reads it; this query param was ignored on the list. | Clamping is safe. Operators were not passed to Mongo on this endpoint. | Keep the cap. Return 400 for non-numeric page/limit so clients notice. |
| F27 | Low | Security | Unauthenticated file URL is rejected | `GET /uploads/qa.png` with no token. | 401, bucket not public. Actual: 401 `Not authorized, no token`. Local driver is `local` (R2 vars unset), so a public R2 URL was not tested. | Response 401. `uploadsAuth` test in the suite also expects 401. | Auth middleware on the upload route. | When R2 is on, confirm the bucket blocks anonymous GET. Not verified here. |
| F28 | Low | Security | CORS allows the local app and blocks an evil origin | `GET /api/platform/plans` with `Origin: https://evil.example` and with `Origin: http://localhost:5174`. | Allow configured origins only. Actual: no `Access-Control-Allow-Origin` on the evil request. Local origin echoed. Code also allows any `https://leap*.vercel.app` and requests with no Origin. | Probe `cors`. `app.js` origin callback. | Preview-URL regex is broad. | List real preview hosts. Keep no-origin only for server-to-server if you must. |
| F29 | Low | UX | Tailwind spacing does apply | Inspect `main` on the dashboard at 1440 and 390. | If the suspicion were true, computed padding would be 0 and content would touch the sidebar. Actual: class `px-6 lg:px-8 py-6 lg:py-8` computed to padding **32px** at 1440 (`lg:px-8`) and **24px** at 390. `scrollWidth` equals the viewport (1440 and 390), so no horizontal scroll. | CDP `getComputedStyle`. | Not reproduced on this build. `index.css` imports Tailwind before the token file; utilities are generated. | No code change from this check. Re-test if a page is later found flush to the edge. |
| F30 | Medium | Tenant | WhatsApp starter templates appear on a brand-new gold gym | `GET /api/whatsapp-templates` as the new gold owner, before anyone created a template. | Empty list, or an explicit "install starters" action. Actual: 200, count 2, including a template named "Special discount". | Probe body. `getTemplates` calls `ensureStarterTemplates`. | Auto-seed on read. Not a cross-tenant leak (created for that user). | Show them as defaults in the UI so it does not look like leftover data. |
| F31 | Low | Platform | Price create body does not match the docs in the controller comment path | `POST /api/platform/prices` with `planKey`, `cycle`, `amount`. | Created or a clear validation error. Actual: 400 `planId, cycle, and amount are required`. | Response. | Controller expects `planId`, not `planKey`. | Accept `planKey` or document `planId` in the form. |
| F32 | Medium | Security | Platform JWT is rejected on tenant routes | `GET /api/tenant/me` with the platform access token. | 401. Actual: 401 `{message:"Token failed"}`. | Probe `platform-jwt-on-tenant`. | Different secret and audience. | Keep it. The reverse (tenant JWT on `/api/platform`) was not completed; see Not tested. |
| F33 | Low | UX | Login rate limit is visible and human | After many tenant logins from this machine, the gym login page. | 429 with a sentence, email kept. Actual: "Too many login attempts, try again in 15 minutes". Email still in the field. | `qa-evidence/qa-tenant-login-ratelimit-390.png`. Limiter is 10 / 15 min on `POST /api/users/login` (`loginLimiter.js`). | Working as designed. It also blocked the rest of the UI walk. | Good. Consider a per-account key so one QA run does not lock every user on the IP. |

---

## 3. Missing data and missing fields

| Where it shows up | What is missing or inconsistent |
|---|---|
| Plan documents | `description` is empty on Basic, Gold, and Platinum. UI says "No description provided for this tier." |
| Plan prices | Lifetime prices are USD; recurring prices are EGP. Basic lifetime is inactive. |
| `GET /api/tenant/me` vs plan card | Card says 25 GB and 2000 WhatsApp messages. Trial tenant payload says 5 GB and 500 messages. Usage shows 0.5 GB with no files. |
| Invoices | Collection count 0. Ledger has purchases. No seller block was exercised because no invoice was issued. |
| Platform settings | Before this test, `platformsettings` count was 0 (no seller, no dunning config). This test wrote keys `seller` (value name "QA Seller") and `maintenance_mode` (left disabled). |
| Tenant `leap` | `ownerUserId` is null. Staff 21 against max 15. No billing address, tax id, or owner phone on the tenant document. Locale is present: EGP, `Africa/Cairo`, `en`. Branding palette and a logo key are present. |
| New QA tenants | Branding logo and display name are null. No billing address, tax number, or phone on the tenant. Currency on the tenant locale is EGP even when lifetime prices are USD. |
| Announcements, coupons | Both collections were empty before this test. No launch announcement, no default coupon. |
| Dashboard snapshot | `getLatestMetrics` reuses today's UTC snapshot and does not recompute until someone clicks Recompute. A plan change during the day stays on the old MRR until then. |
| Seats | `soldLifetimeSeats` does not match the set of tenants currently on lifetime. |
| Branch limit | Field exists (`maxBranches` 1 / 2 / 10). No branch model and no enforcement. |
| Member created in QA | `systemId` 100000, status guest, barcode null. Check-in still stored a log row. |
| Audit | Platform actions that should be audited throw because `tenantId` is required. The platform audit screen therefore cannot be a complete operator trail. The audit list that did load included tenant `member_created` rows, because it is the same collection. |

---

## 4. Feature gaps

Things a gym owner or the SaaS owner would expect, which are absent or only half-built:

- Onboarding that returns or emails a working invite. SMTP is optional in dev and unset here; the console cannot show a link if the handler 500s first.
- MFA that actually gates the console, despite enrollment data and challenge routes.
- A monthly and yearly bank-transfer purchase. Only lifetime checkout exists, and basic lifetime is off.
- Coupon redemption at checkout.
- Invoices for the tenant, with seller legal name, tax id, and billing address.
- Tenant billing profile: legal name, address, tax number, owner phone. Not on the tenant schema used by onboard.
- A way to move a gym to `past_due` from the console.
- Dunning, trial-ending, and payment-received email. Mailer no-ops without `SMTP_HOST`. No trial reminder job.
- Scheduled jobs beyond member expiry and freeze (every 30 minutes, no last-run field in `/api/platform/system/health`). No dunning job, no usage rollup job, no "skip lifetime" billing job.
- Maintenance mode that clients honor.
- Branch management to match `maxBranches`.
- Arabic / RTL. Not exercised. A create with an Arabic owner name was not retried after the slug validation failure (underscores are rejected; that part is fine).
- Member data export for the gym (platform can export a tenant JSON; the gym UI export was not found in this pass).
- Onboarding checklist inside the gym.
- Audit export.
- Help or support link in the console. The header has a search and a theme toggle, not a support target.
- Creating a fourth plan. Enum blocks it while the button is shown.
- The route people will type, `/platform/plans`, does not open Plans.

---

## 5. What works well

Verified against the local API and, where noted, the UI.

- Platform password login and the dashboard render. KPI cards, sidebar, and dark theme are readable at 1440. Padding is 32px, not zero.
- At 390px the dashboard stacks, padding is 24px, `scrollWidth` is 390, and a menu button is present.
- Plans page at `/platform/plans-features` shows 3 plans, 14 features, EGP monthly prices, and the real flag counts (10, 13, 5).
- Feature gates match the plan. Basic: accounting, sales CRM, WhatsApp, executive analytics, and package exceptions return 403 `FEATURE_NOT_IN_PLAN`. Gold: accounting, sales, and WhatsApp return 200. Platinum: sales-manager revenue returns 200 with an EGP monthly breakdown. Basic cannot create an Accountant (`ROLE_NOT_IN_PLAN`).
- Member cap override is enforced: after `maxMembers: 1`, the next create is 403 `PLAN_LIMIT_REACHED`.
- Cross-tenant: gold token `GET /api/members/:id` and `GET /api/members/by/:id` for a basic member both 404.
- Impersonation: `POST /api/platform/support/impersonate` returns a token; POST member is 403 `IMPERSONATION_READ_ONLY`; GET `/api/tenant/me` is 200. Support role can impersonate. Analyst can read overview and gets 403 creating an announcement. Billing can read payments and gets 403 creating a tenant and listing operators.
- Export `GET /api/platform/support/tenants/:id/export` returns 200 with keys `exportMetadata, tenant, staff, members, packages, notes, billingEvents, auditLogs`.
- Suspend and reactivate with a mandatory reason. Missing reason is rejected.
- Trial-expired and past-due member routes behave as coded (403 / read-only).
- Unknown barcode check-in is 404.
- Empty member create is 400 `VALIDATION_FAILED` with a request id, not a stack.
- Pagination clamps `limit=100000` to 100.
- Platform token on a tenant route is 401.
- `GET /uploads/...` without a token is 401.
- Evil origin does not get CORS allow. Local Vite origin does.
- Helmet on `/`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, HSTS. CSP is disabled in `app.js` on purpose.
- Tenant login rate limit message is plain language.
- `npm test` in `Backend`: **34 files, 198 tests, 198 passed, 0 failed, 0 skipped** (about 2.4s). These are unit tests with mocks, including isolation and password-setup cases. They did not hit this database.
- Cache keys for tenant routes include `tenantId` when the user is authenticated (`buildCacheKey`). Platform keys are `platform:{path}` and do not include the operator id; that is acceptable only while the payload does not vary by role.

---

## 6. Not tested

| Item | Why |
|---|---|
| Tenant UI after login (onboarding wizard, branding, staff screens, check-in screen, CRM, Excel, reports) | Gym login from the browser returned the 15-minute rate limit after the API probes. API coverage above stands in for part of this. |
| Impersonation banner, read-only clicks, and expiry in the gym UI | API only. |
| MFA challenge with a real code | Login never offers a challenge, so there is no code to enter. |
| Tenant JWT used on `/api/platform/*` | Not replayed after a tenant token existed. |
| Confirm and reject of a manual payment, repeat confirm, refund, invoice PDF | No pending payment was created. Basic lifetime checkout 404'd. Grant/refund endpoints were not driven to success. |
| Concurrent last lifetime seat | Would require lowering a live seat cap on a shared price. Not done, so the existing gold/platinum caps were left as found. |
| Upload of a real PNG, a renamed fake, an oversized file, a path-traversal name, signed URL expiry, public R2 | Storage driver is local. Only unauthenticated `GET /uploads/qa.png` was called. |
| Excel import good file and bad rows | Not run. |
| Login lockout at 5 failures | Not driven, to avoid locking the super admin. One wrong password returned 401 `AUTH_INVALID_CREDENTIALS` with a request id. |
| Platform auth rate limit (15 / 15 min) | Not exhausted. |
| X-Forwarded-For bypass | One spoofed login still returned 401. Not enough requests to prove the limiter key changed. |
| Light theme, keyboard-only pass, contrast numbers, focus rings | Dark theme only. Inputs on the login forms have labels. Status is not only color (text says Active, Trial, and so on). |
| Tablet width | Only 1440 and 390. |
| Arabic and RTL layout | Not opened in the UI. |
| Production Render and the committed `Frontend/.env` target | Not called, on purpose. |
| R2 bucket privacy | `STORAGE_DRIVER` is not `r2` in this env. |
| Backups and restore | No procedure in the repo. Not run. |
| Replica-set transaction | Atlas SRV resolves to three hosts, so a replica set exists. No multi-document transaction was executed. The onboard bug shows the code is not using one. |
| `npm run simulate:package-immutability` | Not run. |
| Frontend `npm audit` and frontend tests | Frontend `package.json` has no test script. Audit was run in `Backend` only. |
| Error UI for offline, 500 page, and expired session | Not simulated in the browser. API 401 and 403 bodies are JSON with `code` and, on the newer errors, `requestId`. Older handlers return `{message, error}` with the raw exception. |
| Double-submit of payment confirm | No payment id to confirm. |

---

## 7. Operations checklist

| Check | Result |
|---|---|
| Health endpoint | **Partial.** `GET /` returns `Flame Factory API is running` (200). `GET /api/platform/system/health` returns `status: healthy`, database `test`, memory, and cache stats. It does not list jobs. |
| Structured logs and request ids | **Partial.** JSON logs on the server. Newer errors include `requestId` (`req_…`). `X-Request-Id` is on responses. 500s from plan/tenant controllers often omit it and include `err.message`. |
| Error monitoring | **No.** No Sentry or equivalent in the dependencies reviewed. |
| Scheduled jobs | **Partial.** `startScheduledTasks` runs member expiry and freeze every 30 minutes and once at boot. No last-run status. No dunning, no usage rollup, no metrics cron. Lifetime tenants are not special-cased in those two jobs because the jobs operate on members, not subscriptions. |
| Transactional email | **No** in this environment. `SMTP_HOST` unset. Mailer skips. Invite and reset links are not delivered. |
| Backups / restore | **No** documented procedure found. |
| Replica set | **Yes** at the cluster (three SRV hosts). Application transactions not verified. |
| CORS | **Partial.** Localhost allowed, `https://evil.example` denied, any `leap*.vercel.app` allowed by regex. |
| Security headers | **Partial.** nosniff, SAMEORIGIN, no-referrer, HSTS. CSP off. |
| Secrets in the repo | **Partial.** `Backend/.env` is gitignored. `Frontend/.env` is tracked and contains only `BACKEND_ORIGIN` pointing at Render, not a password. Do not treat that as a secret, but a local `npm run dev` without an override talks to Render. |
| `npm audit` (Backend) | **32** vulnerabilities: 3 critical, 11 high, 15 moderate, 3 low. Critical: `proxy-addr` (via express), `tinypool` / `vitest` (dev). High and relevant to runtime: `multer`, `xlsx`, `body-parser`, `zod`. |
| `.env.example` | **Partial.** Backend example covers Mongo, JWT, platform JWT, tenant key, R2, SMTP, bank fields, `FRONTEND_ORIGIN`. It does not mention `RENDER_*`, `VERCEL_*`, `JWT_EXPIRES_IN`, or `LOG_LEVEL`, which the code reads. Frontend example has `BACKEND_ORIGIN` only. |
| CI | **No.** No `.github` workflows. Isolation and package-immutability tests are not run in CI because there is no CI. |

---

## 8. Cleanup list

All of the following were created by this audit. Password for every QA user below is `QaTest!234`.

| Kind | Identifier | Notes |
|---|---|---|
| Tenant | `qa-basic` | Trial, plan restored to basic. **Limit overrides left at maxMembers 1, maxStaff 1, maxBranches 1.** One guest member `qa-member-one`, two check-in log rows. Owner `qa-basic@example.com`. |
| Tenant | `qa-gold` | Trial, plan gold. Owner `qa-gold@example.com`. WhatsApp starter templates were auto-created on first read. |
| Tenant | `qa-platinum` | Trial, plan platinum. Owner `qa-platinum@example.com`. |
| Tenant | `qa-lifetime` | Active, cycle lifetime, plan gold, amount 10 EGP on a purchase ledger row. Owner `qa-lifetime@example.com`. |
| Tenant | `qa-trial` | Left as trial with `trialEndsAt` about three days out. Owner `qa-trial@example.com`. |
| Platform user | `qa_billing@example.com` | Role billing. Created despite HTTP 500. |
| Platform user | `qa_support@example.com` | Role support. |
| Platform user | `qa_analyst@example.com` | Role analyst. |
| Feature | key `qa_feature` | Empty description. This is why the catalog count is 14 rather than 13. |
| Coupon | `QA_SAVE10` | 10% , max 2. A PATCH sent `redeemedCount: 999`. Confirm and delete. |
| Announcement | title `qa_announcement` | Active, target all. |
| Setting | `seller` | Value name "QA Seller", description "qa". Did not exist before. |
| Setting | `maintenance_mode` | Enabled during the test and then disabled. |
| Plan Basic | description | Was briefly set to a QA sentence and **reverted to empty**. |

Not created, despite attempts: slug `qa_basic` (underscore rejected), a plan `qa_plan` (enum rejected).

The pre-existing `leap` tenant, its members, and the three original billing events (2499 USD, 1299 USD, 0 USD grant) were not intentionally modified. Seat counters `soldLifetimeSeats` were not written by this audit's checkout, because checkout failed.

---

## Tests

```
Test Files  34 passed (34)
Tests       198 passed (198)
Duration    2.42s
```

No skipped tests. No frontend test script. No CI config. The passing isolation tests mock Mongoose; they did not prove the live `qa-basic` vs `qa-gold` check, which was done separately and passed (404).
