# Forma / Leap — Availability & DoS Resilience Checklist

**Last reviewed:** 2026-11-23 (DNS proxy path verified)  
**Scope:** Production stack as implemented in this repo + documented platform choices.  
**Related:** [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) · [BACKUP_RESTORE.md](./BACKUP_RESTORE.md) · [DOMAIN_NETWORKING.md](./DOMAIN_NETWORKING.md) · [SECURITY_PENTEST_CHECKLIST.md](./SECURITY_PENTEST_CHECKLIST.md) · [ERROR_HANDLING.md](./ERROR_HANDLING.md) · [SECURITY_OPS_ATTESTATION.md](./SECURITY_OPS_ATTESTATION.md)

### Stack under review

| Layer | Technology | Hosting |
| --- | --- | --- |
| SPA | React 19 + Vite + Tailwind | **Vercel** (`app` / `www` / `platform` on `forma-official.com`) |
| API | Node ≥22.12, Express 5, Mongoose 9 | **Railway** (prod `api.forma-official.com`); **Render** free plan = test only |
| Database | MongoDB Atlas (`MONGO_URI`) | Atlas (managed) |
| Object storage | Cloudflare R2 (`@aws-sdk/client-s3`) | Cloudflare |
| Email | Brevo transactional API | Brevo |
| Messaging | WhatsApp via Baileys (in-process) | Same API process |
| Payments | Manual bank transfer (no live card gateway) | Config via `PAYMENT_*` |
| Auth | Custom JWT + httpOnly cookies | Self-hosted |
| Monitoring | Optional Sentry (`SENTRY_DSN`) | Sentry when configured |
| CI / backups | GitHub Actions | `ci.yml`, `mongo-backup.yml` |

**Not in use:** Dockerfiles, Kubernetes, Redis, dedicated job queues (Bull/SQS), Cloudflare Workers WAF configs in-repo, third-party auth (Clerk/Auth0).

### Status legend

| Marker | Meaning |
| --- | --- |
| ✅ | Protected / mitigated — evidence in repo or cited platform default |
| ⚠️ | Partial / needs verification or hardening |
| ❌ | Not protected / not found in repo |
| 🔍 | Needs manual/ops check (platform console, DNS, Atlas, dashboards) |

### Executive summary

| Status | Count |
| --- | --- |
| ✅ Protected / mitigated | **17** |
| ⚠️ Partial / needs work | **23** |
| ❌ Not protected / not found | **4** |
| 🔍 Needs manual/ops check | **13** |
| **Total checklist items** | **57** |

**Readiness verdict:** Application-layer abuse controls (rate limits, auth lockouts, body/upload caps, graceful shutdown, health probes, env fail-closed, backups) are relatively strong. **Edge verified 2026-11-23 (Cloudflare Free complete):** Proxied hosts, DDoS Active, Full (strict), Min TLS 1.2, Always Use HTTPS, DNSSEC, Bot Fight Mode, Browser Integrity Check, R2 private, DDoS notifications, API cache bypass, account 2FA, email routing OK. Managed WAF N/A on Free. Remaining largest gaps are **app/ops**: Slowloris timeouts, capacity alerting, connection-pool tuning, circuit breakers, cache-stampede control, multi-replica WhatsApp.

---

## 1. Cybersecurity attacks

### 1.1 DDoS (volumetric / application)

| Field | Detail |
| --- | --- |
| Threat | Saturate API/SPA so legitimate users cannot reach the service |
| Status | ✅ |
| Evidence | **Ops 2026-11-23:** Cloudflare DDoS managed rulesets **Active** (SSL/TLS + Network-layer; HTTP ruleset always on; no custom override). **DNS verified Proxied:** `api.forma-official.com` → Railway (`fr4vy12m.up.railway.app`), `app` / `www` / apex → Vercel (`*.vercel-dns-017.com`). Email/Brevo CNAMEs, MX, TXT correctly **DNS only**. App-layer: `/api` rate limits (`Backend/src/app.js`, `rateLimitBudgets.js`). Note: `platform.forma-official.com` has **no DNS record** (optional host; console may live under `app…/platform`). |
| Next action | Keep user-facing hosts Proxied. Keep Brevo/mail records DNS-only. Keep SSL **Full (strict)**. Document IR owner. |

### 1.2 SYN Flood

| Field | Detail |
| --- | --- |
| Threat | Exhaust connection tables at L3/L4 |
| Status | ✅ |
| Evidence | **Ops 2026-11-23:** Cloudflare Network-layer DDoS **Active** + public hosts **Proxied**, so SYN/UDP/ICMP floods are absorbed at Cloudflare before Railway/Vercel. Not controllable from Node/Express. |
| Next action | None for app code; keep orange cloud on public hosts. |

### 1.3 HTTP Flood

| Field | Detail |
| --- | --- |
| Threat | High-rate HTTP requests exhaust app workers |
| Status | ⚠️ |
| Evidence | Global limiter **600 req / 15 min / IP** on `/api` (`rateLimitBudgets.js`). Stricter auth/upload limiters. In-memory per process. **Ops 2026-11-23:** Cloudflare **Bot Fight Mode On**; **Browser Integrity Check On**; HTTP DDoS always active; DDoS alerts On. Full Cloudflare Managed WAF ruleset unavailable on **Free** plan (accepted). |
| Next action | Add shared store (Redis) if scaling replicas; optional CF rate-limit rule or Pro WAF later. |

### 1.4 Slowloris

| Field | Detail |
| --- | --- |
| Threat | Hold many slow connections open to exhaust sockets |
| Status | ❌ |
| Evidence | **Not found:** no `headersTimeout` / `requestTimeout` / `keepAliveTimeout` tuning on the HTTP server in `Backend/server.js`. Body size is capped (`express.json({ limit: "100kb" })`) which helps payload floods but not slow headers. |
| Next action | Set Node `server.headersTimeout` / `requestTimeout` (and confirm Railway proxy idle timeouts). |

### 1.5 DNS Amplification

| Field | Detail |
| --- | --- |
| Threat | Abuse open resolvers / DNS infra to amplify traffic toward victims |
| Status | ✅ |
| Evidence | App is a DNS *client* only (`connectMongo.js`). Authoritative zone on Cloudflare (not an open recursive resolver). **Ops 2026-11-23:** DNSSEC **On**; network-layer DDoS Active. |
| Next action | None for app; keep DNSSEC on. |

### 1.6 DNS Poisoning

| Field | Detail |
| --- | --- |
| Threat | Corrupt DNS answers so clients hit attacker hosts |
| Status | ✅ |
| Evidence | **Ops 2026-11-23:** Cloudflare **DNSSEC On**. Production hosts documented in `DOMAIN_NETWORKING.md`. |
| Next action | Enable registrar domain lock + account 2FA if not already. |

### 1.7 DNS DDoS

| Field | Detail |
| --- | --- |
| Threat | Overwhelm authoritative DNS so `forma-official.com` fails to resolve |
| Status | ✅ |
| Evidence | Zone authoritative DNS is Cloudflare (20 records). **Ops 2026-11-23:** Network-layer DDoS managed ruleset **Active** (includes DNS flood mitigation). MX via `route{1,2,3}.mx.cloudflare.net`. |
| Next action | Keep zone on Cloudflare; optional external resolution monitor. |

### 1.8 Resource Exhaustion (CPU / memory / disk via crafted requests)

| Field | Detail |
| --- | --- |
| Threat | Force expensive work (uploads, PDF, sharp, large JSON, imports) until OOM/CPU peg |
| Status | ⚠️ |
| Evidence | JSON body **100kb** (`app.js`); multer memory storage with size caps (`config/multer.js`, `utils/prepareUpload.js`: intake 15MB, docs/sheets 5MB, PDF page cap 40, image pixel cap 40M); upload write rate limit 10/15min; SVG sanitization; CSV-only import (xlsx removed). Still: sharp/PDF work is CPU-heavy; imports run in-process; no request CPU budget / worker isolation. |
| Next action | Cap concurrent imports/uploads per tenant; move heavy work off the request path if load grows. |

### 1.9 API Abuse (credential stuffing, spam signup, scraping)

| Field | Detail |
| --- | --- |
| Threat | Automated abuse of auth and public endpoints |
| Status | ✅ |
| Evidence | Login / forgot / setup limiters; account lockout with `retryAfter` (`userController.js`, `platformAuthController.js`); platform auth limiter; public signup limiter; Helmet; CSRF Origin/Referer check (`middleware/csrfOrigin.js`); Zod validation; mongo-sanitize (`middleware/sanitize.js`); security suite `npm run test:security` + CI. |
| Next action | Keep budgets documented; add per-tenant write quotas if abuse shifts post-auth. |

### 1.10 ReDoS

| Field | Detail |
| --- | --- |
| Threat | Pathological regex on user input pins the event loop |
| Status | ⚠️ |
| Evidence | Tenant member search escapes input (`escapeRegex` in `utils/username.js`, used by `memberController.js`, `memberFilters.js`, `accessController.js`, inbox). Covered by `src/tests/security/checklistGaps.test.js`. **Gap:** several platform controllers build `new RegExp(search.trim(), "i")` **without** escaping (`platformTenantController.js`, `platformUserController.js`, `platformSupportController.js`, `platformBillingController.js`, `platformFeatureTrialController.js`, `platformPlanController.js`). Platform routes are authz-gated but still abuseable by a compromised/low-priv platform operator or stolen session. |
| Next action | Route all platform search through `escapeRegex` (same helper as tenant). |

### 1.11 XXE

| Field | Detail |
| --- | --- |
| Threat | XML external entity expansion / SSRF via XML parsers |
| Status | ✅ |
| Evidence | No XML ingestion stack found. Member import is **CSV-only** (`csv-parse`; SECURITY_PENTEST notes `xlsx` removed). PDFs processed with `pdf-lib` + page limits (`prepareUpload.js`). SVG handled via `assertSafeSvg` / magic bytes — not a general XML parser for untrusted DTDs. |
| Next action | Keep refusing XML/XLSX uploads; re-review if any new XML dependency is added. |

### 1.12 Deserialization attacks

| Field | Detail |
| --- | --- |
| Threat | Unsafe object revive / prototype pollution via untrusted serialized payloads |
| Status | ✅ |
| Evidence | Request bodies go through `express.json` + Zod schemas (`validation/schemas.js`). No `node-serialize`, `js-yaml` `load`, `pickle`, or `eval` of user input found. Mongoose schemas constrain persisted shapes. |
| Next action | Ban unsafe serializers in dependency review; keep Zod on write paths. |

---

## 2. Application-level failures

### 2.1 Memory leaks

| Field | Detail |
| --- | --- |
| Threat | Process RSS grows until OOM / Railway restart loop |
| Status | ⚠️ |
| Evidence | In-memory API cache capped at 5000 keys with LRU (`services/cacheService.js`). Auth context cache exists (`authContextCache.js`). WhatsApp Baileys sessions restored in-process (`server.js` → `restoreConnectedSessions`) — known sticky single-process constraint (`PRODUCTION_CHECKLIST.md`). Sentry optional. **No** heap/metrics alerts defined in repo. |
| Next action | Enable Railway memory metrics + alert; load-test WhatsApp session restore; consider externalizing sessions if multi-replica. |

### 2.2 Infinite loops / hung requests

| Field | Detail |
| --- | --- |
| Threat | Request never returns; pool of sockets / event loop stalls |
| Status | ⚠️ |
| Evidence | SPA axios timeout **15s** (`Frontend/src/api/axios.js`). Mongo `serverSelectionTimeoutMS: 10000` (`connectMongo.js`). **No** Express middleware that aborts long handlers; no `AbortSignal` plumbing on most controllers. |
| Next action | Add server-side request deadline middleware for expensive routes; use `maxTimeMS` on heavy aggregations. |

### 2.3 Database connection exhaustion

| Field | Detail |
| --- | --- |
| Threat | Too many concurrent Mongo sockets → new requests hang |
| Status | ⚠️ |
| Evidence | `mongoose.connect` uses defaults for pool size — **no explicit `maxPoolSize` / `minPoolSize` / `maxIdleTimeMS`** in `connectMongo.js`. Boot fails if Mongo unreachable (`config/db.js` → `process.exit(1)`). Health returns 503 when DB not connected (`healthController.js`). |
| Next action | Set explicit pool sized to Atlas tier + Railway replica count; expose pool stats on internal health. |

### 2.4 Deadlocks

| Field | Detail |
| --- | --- |
| Threat | Multi-document transactions wait forever |
| Status | ⚠️ |
| Evidence | Transactions used in billing (`services/billing/billingService.js` → `session.startTransaction()`). Scheduler uses Mongo locks (`utils/schedulerLock.js`). No general deadlock detector or transaction timeout wrapper found. |
| Next action | Set transaction time limits; keep critical paths short; monitor Atlas lock metrics. |

### 2.5 Unhandled exceptions

| Field | Detail |
| --- | --- |
| Threat | Crash process or leak stack traces |
| Status | ✅ |
| Evidence | Central `errorHandler` (`middleware/errorHandler.js`) with safe envelopes (`ERROR_HANDLING.md`). `unhandledRejection` logged + Sentry; `uncaughtException` terminates after close (`server.js`). Request IDs via `requestId` middleware. |
| Next action | Confirm `SENTRY_DSN` set in Railway prod; alert on spike of `INTERNAL_ERROR`. |

### 2.6 Dependency failure (mail, storage, payment, WhatsApp)

| Field | Detail |
| --- | --- |
| Threat | Third-party outage cascades into full outage or silent data loss |
| Status | ⚠️ |
| Evidence | **R2:** fail-closed at boot (`storageService.assertConfigured()` in `server.js`). **Brevo:** fail-open / skip send when unconfigured (`mailer.js` — onboarding continues). **Payment bank details:** fail-closed in production (`paymentAdapter.js` throws 503 if bank fields empty). **WhatsApp:** session restore errors logged, server still runs. **No circuit breakers** / bulkhead pattern for outbound HTTP. |
| Next action | Add timeouts + circuit breaker around Brevo/R2 calls; surface “mail degraded” on platform health. |

### 2.7 Thread / event-loop exhaustion

| Field | Detail |
| --- | --- |
| Threat | Sync CPU work (sharp, crypto, regex) blocks all requests |
| Status | ⚠️ |
| Evidence | Single Node process model; heavy image/PDF work on upload path (`prepareUpload.js`). No worker_threads pool for uploads. Rate limits reduce abuse surface only. |
| Next action | Offload sharp/PDF to async queue/worker process under load; monitor event-loop lag. |

### 2.8 Queue overflow

| Field | Detail |
| --- | --- |
| Threat | Background work backlog grows unboundedly |
| Status | ❌ |
| Evidence | **No dedicated queue** (no Bull/BullMQ/SQS). Jobs are `setInterval` in-process (`scheduledTasks.js`) with `SchedulerLock`. Member imports use `MemberImportJob` documents + runner in the API process — no max-queue / backpressure documented in code beyond stored error samples. |
| Next action | Cap concurrent import jobs; reject new imports when one is running per tenant; consider a real queue before multi-replica scale-out. |

### 2.9 Cache stampede

| Field | Detail |
| --- | --- |
| Threat | Many concurrent misses after TTL → thundering herd on Mongo |
| Status | ❌ |
| Evidence | `cacheResponse` middleware (`middleware/apiCache.js`) + in-memory `CacheService` — **no singleflight / request coalescing** on miss. Tag invalidation exists (`cacheInvalidator.js`) but stampede on expiry remains. |
| Next action | Add in-flight promise map per cache key (singleflight) for hot list endpoints. |

---

## 3. Infrastructure and server failures

### 3.1 CPU saturation

| Field | Detail |
| --- | --- |
| Threat | Host CPU 100% → latency collapse |
| Status | 🔍 |
| Evidence | No CPU alerts or autoscaling config in repo. Railway plan/size is console-side. |
| Next action | Set Railway CPU alert + runbook; profile hot endpoints (`Backend/perf/`). |

### 3.2 RAM exhaustion

| Field | Detail |
| --- | --- |
| Threat | OOM kill of API container |
| Status | 🔍 |
| Evidence | Cache maxSize helps slightly; multer uses memory storage. Restart policy exists (`Backend/railway.json` → `ON_FAILURE`). No memory limit declared in repo. |
| Next action | Set Railway memory limit/alert; avoid buffering huge CSVs. |

### 3.3 Disk full

| Field | Detail |
| --- | --- |
| Threat | Ephemeral disk fills → writes/logs fail |
| Status | ⚠️ |
| Evidence | Docs state Railway/Render disks are ephemeral; durable blobs go to R2 (`BACKUP_RESTORE.md`). `LOG_TO_FILE` discouraged in prod (`PRODUCTION_CHECKLIST.md`). No disk-usage probe in `/health`. |
| Next action | Keep logging to stdout only; confirm no local session/media writes on API disk. |

### 3.4 I/O saturation

| Field | Detail |
| --- | --- |
| Threat | Disk/network I/O bottleneck |
| Status | 🔍 |
| Evidence | App I/O is mostly Mongo + R2 network. Not instrumented in-repo. |
| Next action | Watch Atlas + R2 + Railway network metrics during import/upload spikes. |

### 3.5 Network failure

| Field | Detail |
| --- | --- |
| Threat | Loss of connectivity between SPA ↔ API ↔ Atlas ↔ R2 |
| Status | 🔍 |
| Evidence | Health reflects Mongo readiness. Frontend treats timeouts (`axios.js`). Multi-AZ Atlas / Railway region choices not in repo. |
| Next action | Document regions; add synthetic uptime checks for `api` + `app` + Atlas ping. |

### 3.6 Load balancer failure

| Field | Detail |
| --- | --- |
| Threat | Edge/proxy outage makes API unreachable |
| Status | 🔍 |
| Evidence | Railway custom domain + healthcheck (`railway.json` `healthcheckPath: /health`, timeout 60s). Vercel for SPA. No secondary active-active region. |
| Next action | Confirm Railway health routing; define failover story (status page). |

### 3.7 Firewall misconfiguration

| Field | Detail |
| --- | --- |
| Threat | Accidental block of clients or Atlas |
| Status | ⚠️ |
| Evidence | `PLATFORM_IP_ALLOWLIST` optional for platform console. Atlas Network Access is ops-side. **Ops 2026-11-23:** Browser Integrity Check On; Bot Fight On; Free plan (no full Managed WAF). Custom CF firewall rules not documented in repo. |
| Next action | Document Atlas IP allowlists; change-control for CF/Atlas network changes; consider Pro WAF later. |

### 3.8 SSL / TLS (edge ↔ origin + certificate expiration)

| Field | Detail |
| --- | --- |
| Threat | Cleartext or unverified CF↔origin hop; browsers block expired visitor-facing certs |
| Status | ✅ |
| Evidence | **Ops 2026-11-23:** Cloudflare SSL/TLS = **Full (strict)**; **Always Use HTTPS On**; **Minimum TLS Version = 1.2**. Automatic mode on. Visitor traffic mostly TLS 1.3. HSTS on SPA (`vercel.json`). Origin certs managed by Railway + Vercel. |
| Next action | Optional external SSL expiry probe. |

### 3.9 Container / process crash

| Field | Detail |
| --- | --- |
| Threat | Process dies and stays down |
| Status | ✅ |
| Evidence | `Backend/railway.json`: `restartPolicyType: ON_FAILURE`, `restartPolicyMaxRetries: 5`, `drainingSeconds: 15`, healthcheck `/health`. Graceful SIGTERM drain (`server.js` `SHUTDOWN_GRACE_MS`). Render blueprint also has `healthCheckPath: /health`. |
| Next action | Alert on restart loops; keep health DB-aware (already 503 when degraded). |

### 3.10 Kubernetes misconfiguration

| Field | Detail |
| --- | --- |
| Threat | Bad manifests / probes / resources |
| Status | ✅ |
| Evidence | **N/A — not deployed on Kubernetes.** No Helm/K8s manifests in repo. Risk avoided by PaaS (Railway/Vercel/Render). |
| Next action | If migrating to K8s later, reinvent probes/resources carefully; until then leave N/A. |

---

## 4. Database-related failures

### 4.1 DB crashes / primary failover

| Field | Detail |
| --- | --- |
| Threat | Atlas outage or primary election |
| Status | 🔍 |
| Evidence | Connection uses `retryWrites` when resolving SRV (`connectMongo.js`). Driver reconnect is mongoose default. App health goes 503 while disconnected. |
| Next action | Confirm Atlas cluster tier + multi-region preferences; subscribe to Atlas alerts. |

### 4.2 Connection pool exhaustion

| Field | Detail |
| --- | --- |
| Threat | Same as §2.3 at DB tier |
| Status | ⚠️ |
| Evidence | No explicit `maxPoolSize`. Multiple API replicas would multiply pools. |
| Next action | Set `maxPoolSize` per process; size against Atlas connection limits. |

### 4.3 Slow queries

| Field | Detail |
| --- | --- |
| Threat | Unindexed scans freeze API |
| Status | ⚠️ |
| Evidence | Rich compound indexes on members/users (`Member.js`, `User.js`, etc.) + `migrate:indexes` script. Perf notes under `Backend/perf/`. **No** Atlas Profiler / slow-query alert wired from app. |
| Next action | Enable Atlas Performance Advisor alerts; add `maxTimeMS` on large list/BI aggregations. |

### 4.4 Locks / deadlocks

| Field | Detail |
| --- | --- |
| Threat | Contended documents block writers |
| Status | ⚠️ |
| Evidence | Billing transactions; scheduler locks; optimistic conflict codes (`VERSION_CONFLICT` in error catalog). No automated lock wait alerting. |
| Next action | Monitor Atlas lock metrics; keep write transactions tiny. |

### 4.5 Storage exhaustion

| Field | Detail |
| --- | --- |
| Threat | Atlas disk full |
| Status | 🔍 |
| Evidence | Not app-controlled. Nightly dump + Atlas snapshots documented (`BACKUP_RESTORE.md`). |
| Next action | Atlas disk autoscaling / alerts; review retention of large collections (audit, inbox). |

### 4.6 Corrupted data / bad writes

| Field | Detail |
| --- | --- |
| Threat | Logical corruption from bugs or bad imports |
| Status | ⚠️ |
| Evidence | Tenant restore script `restoreTenantFromBackup.js`; encrypted nightly dumps; maintenance mode + restore runbook. Restore **drills are manual monthly** (checklist item, not automated). |
| Next action | Schedule and record monthly restore drills in `PRODUCTION_CHECKLIST.md`. |

### 4.7 Replication failures

| Field | Detail |
| --- | --- |
| Threat | Secondaries lag / RS unhealthy |
| Status | 🔍 |
| Evidence | Atlas-managed replica set. App connects with majority write concern when resolving standard URI. |
| Next action | Atlas alert on replication lag / member state. |

### 4.8 Excessive concurrent queries

| Field | Detail |
| --- | --- |
| Threat | Burst of expensive reads (BI, exports, “show all members”) |
| Status | ❌ |
| Evidence | Response caching mitigates some GETs; **no** global query concurrency semaphore. Cached routes still stampede on miss (§2.9). |
| Next action | Rate-limit heavy analytics/export routes separately; coalesce cache fills. |

### 4.9 Credential / config changes

| Field | Detail |
| --- | --- |
| Threat | Rotated URI/secrets break prod; wrong URI points at test |
| Status | ⚠️ |
| Evidence | `validateEnv` refuses missing/placeholder secrets in production (`config/validateEnv.js`). Ops attestation for test≠prod secrets (`SECURITY_OPS_ATTESTATION.md`, dated 2026-11-17). Nightly backup uses `MONGO_URI` Actions secret. |
| Next action | Re-attest after every secret rotation; never share Render test URI with Railway prod. |

---

## 5. External dependencies / third-party services

### 5.1 DNS provider

| Field | Detail |
| --- | --- |
| Threat | Zone outage or mis-edit |
| Status | ⚠️ |
| Evidence | Zone on Cloudflare; **Ops 2026-11-23:** DNSSEC On, DDoS notifications On, proxied public hosts. No IaC for DNS; change control not documented. |
| Next action | Dual-person change control; enable DNS *record change* notifications if available. |

### 5.2 Cloud provider (Railway / Vercel / Render)

| Field | Detail |
| --- | --- |
| Threat | Regional PaaS outage |
| Status | 🔍 |
| Evidence | Split: API Railway, SPA Vercel, test Render — reduces single-vendor total loss of UI+API together, but API is still single-homed. |
| Next action | Subscribe to status pages; document customer comms template. |

### 5.3 Payment gateway

| Field | Detail |
| --- | --- |
| Threat | Checkout unavailable |
| Status | ✅ |
| Evidence | Production path is **manual bank transfer**, not a live card gateway. Missing bank env → **503 fail-closed** (`paymentAdapter.js`). Online adapter is a stub. |
| Next action | When adding Paymob/Stripe, introduce webhooks, idempotency, and circuit breakers before go-live. |

### 5.4 Auth provider

| Field | Detail |
| --- | --- |
| Threat | IdP outage |
| Status | ✅ |
| Evidence | Self-hosted JWT (`JWT_SECRET` / `PLATFORM_JWT_SECRET`). No external IdP dependency for login availability. |
| Next action | Keep secrets rotatable; monitor login 5xx separately. |

### 5.5 External APIs (Brevo, R2, Atlas, WhatsApp)

| Field | Detail |
| --- | --- |
| Threat | Partial dependency outage |
| Status | ⚠️ |
| Evidence | See §2.6. Atlas/R2 hard deps. **Ops 2026-11-23:** R2 bucket **not public**. Brevo soft. WhatsApp soft for core gym ops. |
| Next action | Platform health page should show dependency status; keep R2 tokens least-privilege. |

### 5.6 CDN

| Field | Detail |
| --- | --- |
| Threat | Static asset delivery failure / stale API via edge cache |
| Status | ✅ |
| Evidence | Vercel serves SPA + headers/CSP (`vercel.json`). **Ops 2026-11-23:** Cloudflare Cache Rule — Hostname `api.forma-official.com` → **Bypass cache** (`http.host eq "api.forma-official.com"`). |
| Next action | Keep API bypass rule enabled; optional SPA HTML bypass if sticky deploys appear. |

### 5.7 Email / messaging

| Field | Detail |
| --- | --- |
| Threat | Invites/resets/WhatsApp fail |
| Status | ⚠️ |
| Evidence | Brevo skip-if-unconfigured; WhatsApp single-process sockets (`PRODUCTION_CHECKLIST.md`). `WHATSAPP_REPLY_GAP_MS` throttles replies. |
| Next action | Alert on Brevo error rates; keep API at one replica while Baileys is in-process. |

### 5.8 ISP / routing

| Field | Detail |
| --- | --- |
| Threat | Path outages between user regions and providers |
| Status | 🔍 |
| Evidence | Outside app control. |
| Next action | Multi-region synthetic checks from key customer geos (EG / others). |

---

## 6. Human errors / operational mistakes

### 6.1 Incorrect deployment

| Field | Detail |
| --- | --- |
| Threat | Bad commit reaches prod |
| Status | ⚠️ |
| Evidence | CI runs isolation + full backend tests, frontend lint/i18n/build, `npm audit` high (`/.github/workflows/ci.yml`). Railway “Wait for CI” is **optional** (`PRODUCTION_CHECKLIST.md`). Healthcheck gates new instance. Rollback = redeploy previous Railway deployment. |
| Next action | Make “Wait for CI” mandatory on Railway prod; require green CI before promote. |

### 6.2 Faulty config / invalid env vars

| Field | Detail |
| --- | --- |
| Threat | Boot with unsafe defaults |
| Status | ✅ |
| Evidence | `validateEnv` + R2 `assertConfigured` refuse bad/missing prod config. Soft warnings for short secrets / localhost origins. |
| Next action | Run `node scripts/ops/checkEnvHygiene.js` in staging; keep attestation current. |

### 6.3 Deleting production resources

| Field | Detail |
| --- | --- |
| Threat | Accidental delete of Railway service, Atlas cluster, R2 bucket |
| Status | 🔍 |
| Evidence | Dashboard least-privilege attested (`SECURITY_OPS_ATTESTATION.md` §12.9). No org-level deletion protection as code. |
| Next action | Enable provider deletion protection / 2FA; restrict who can destroy Atlas/R2. |

### 6.4 Bad firewall / routing changes

| Field | Detail |
| --- | --- |
| Threat | Lock out API or Mongo |
| Status | 🔍 |
| Evidence | Ops-side only. |
| Next action | Change tickets + rollback notes for Cloudflare/Atlas network changes. |

### 6.5 Invalid / mixed environment variables

| Field | Detail |
| --- | --- |
| Threat | Prod API pointed at test DB or Render URL in Vercel |
| Status | ✅ |
| Evidence | Docs explicitly forbid prod `BACKEND_ORIGIN` → Render (`DOMAIN_NETWORKING.md`). Env matrix documented. Attestation that test secrets ≠ prod. |
| Next action | After each deploy, smoke `GET https://api.forma-official.com/health` and login cookie domain. |

### 6.6 Migration failures

| Field | Detail |
| --- | --- |
| Threat | Half-applied schema/index migration |
| Status | ⚠️ |
| Evidence | Many one-off scripts under `Backend/src/scripts/migrate*.js` run manually via npm scripts — **not** an automated migration runner on boot. Additive indexes noted as safe for rollback in prod checklist. |
| Next action | Checklist every migrate with backup + dry-run; never run untested migrate against prod first. |

### 6.7 Expired credentials

| Field | Detail |
| --- | --- |
| Threat | R2/Brevo/GitHub backup secrets expire |
| Status | 🔍 |
| Evidence | Backup workflow fails loudly if secrets missing (`mongo-backup.yml`). No automated rotation. |
| Next action | Calendar rotation for R2/Brevo/Atlas backup user; watch Actions failures. |

### 6.8 Bad autoscaling

| Field | Detail |
| --- | --- |
| Threat | Scale to N replicas → duplicate WhatsApp sessions / rate-limit dilution |
| Status | ⚠️ |
| Evidence | Documented: WhatsApp sockets require **single API replica**; scheduler lock helps jobs but not Baileys (`PRODUCTION_CHECKLIST.md`). In-memory rate limits do not sync across replicas. |
| Next action | Pin Railway replicas=1 until sessions/rate limits are externalized; document hard constraint in runbooks. |

### 6.9 Failed backup / recovery

| Field | Detail |
| --- | --- |
| Threat | Discover backups are empty/unreadable during incident |
| Status | ⚠️ |
| Evidence | Nightly encrypted `mongodump` → R2 (`mongo-backup.yml`, `scripts/ops/mongo-backup.sh`). Restore scripts + tenant-scoped restore exist. R2→R2 upload sync is **manual rclone**, not Actions. Monthly drill is documented but not proven by CI. |
| Next action | Automate upload sync; perform and date-stamp next restore drill. |

---

## 7. Investigation flow + symptom quick reference

### 7.1 Investigation playbook (this stack)

1. **Confirm blast radius**  
   - SPA only? → check Vercel deployment + `BACKEND_ORIGIN`.  
   - API only? → `GET https://api.forma-official.com/health` (expect `status: ok`, `database: connected`).  
   - Single gym? → tenant status / maintenance mode / plan limits.

2. **Pull correlation IDs**  
   - Browser/network: `X-Request-Id`.  
   - Railway logs: JSON lines from `requestLogger` / `logger`.  
   - Sentry (if `SENTRY_DSN` set): tag `request_id`, `tenant_id`.

3. **Check dependency health (in order)**  
   1. Railway service status / recent deploys / restart count  
   2. Mongo Atlas cluster metrics (connections, CPU, disk, replication)  
   3. Cloudflare R2 (upload failures → `STORAGE_UNAVAILABLE`)  
   4. Brevo (mail skipped vs 5xx)  
   5. DNS resolve for `api` / `app` / `www`  
   6. Vercel deployment errors / CSP blocks in browser console  

4. **Distinguish deploy vs runtime**  
   - New errors right after deploy → rollback Railway previous deployment (`PRODUCTION_CHECKLIST.md` §6).  
   - Gradual degradation → pool/CPU/cache stampede/slow query.

5. **Preserve evidence, then mitigate**  
   - Enable maintenance mode from platform console if writes must stop (`BACKUP_RESTORE.md`).  
   - Do **not** scale API replicas >1 while WhatsApp sessions are in-process.  
   - For data loss: restore to scratch DB first, then `restoreTenantFromBackup.js`.

### 7.2 Symptom → likely cause (Forma-specific)

| Symptom | Likely layer | First checks |
| --- | --- | --- |
| `/health` → 503 `database: disconnected` | Mongo / network | Atlas status, `MONGO_URI`, IP allowlist, Railway outbound |
| SPA loads, all API calls 15s timeout | API / network | Railway service up? DNS for `api.forma-official.com`? CORS/`BACKEND_ORIGIN` |
| Login 429 | App abuse control | Expected under stuffing; check IP; wait `retryAfter` |
| Login 401 after deploy | Config / secrets | `JWT_SECRET` rotation invalidates sessions; cookie `Domain` / `BASE_DOMAIN` |
| Uploads fail 503 | R2 | R2 creds, bucket, `assertConfigured` boot logs |
| Invites never arrive | Brevo (soft) | `BREVO_API_KEY` / `MAIL_FROM`; mailer “skipped” logs |
| Checkout/signup 503 bank message | Payment config | `PAYMENT_BANK_NAME` / `ACCOUNT_NAME` / `IBAN` in Railway |
| High latency on member lists only | Cache / DB | Cache stampede; indexes; Atlas slow queries |
| Duplicate scheduled emails/jobs | Multi-instance | Scheduler lock fail-open when Mongo lock store down (`schedulerLock.js`) |
| WhatsApp inbox dead after scale-out | Architecture | Replicas >1 broke Baileys; scale back to 1 |
| Browser CSP / connect errors | Frontend config | `vercel.json` CSP `connect-src` vs live API host |
| Sudden empty gym data | Human / DB | Accidental delete → tenant restore from backup |
| CI green but prod broken | Env drift | Railway env vs `.env.example`; Vercel `BACKEND_ORIGIN` |

---

## Priority backlog (top 10)

| # | Gap | Status today | Impact | Action |
| --- | --- | --- | --- | --- |
| 1 | No Slowloris / server request timeouts | ❌ | Availability | Set Node `headersTimeout` / `requestTimeout`; align with Cloudflare/Railway idle timeouts |
| 2 | In-memory rate limits (no shared store) | ⚠️ | Abuse under scale | Redis (or Cloudflare/Vercel edge) limiter before multi-replica |
| 3 | Mongo pool untuned | ⚠️ | Cascading latency | Explicit `maxPoolSize` sized to Atlas + replicas |
| 4 | Cache stampede / no singleflight | ❌ | DB overload | Coalesce concurrent cache fills on hot GETs |
| 5 | No real job queue / import backpressure | ❌ | Memory/CPU peg | Cap concurrent imports; optional worker |
| 6 | Platform search ReDoS (unescaped RegExp) | ⚠️ | Event-loop DoS | Use `escapeRegex` on all platform search paths |
| 7 | WhatsApp + rate limits force single replica | ⚠️ | Scale ceiling | Externalize sessions or keep hard pin replicas=1 + alert |
| 8 | Observability alerts incomplete | 🔍 | Slow MTTD | Railway/Atlas/Sentry alerts for 5xx, restarts, disk, connections |
| 9 | Backup restore drills + R2 upload sync not automated | ⚠️ | RTO risk | Automate rclone sync; date-stamp monthly restore |
| 10 | Name edge IR owner | 🔍 | Ops | Document who responds to Cloudflare/Railway incidents |

---

## How to maintain this document

1. After any availability-related change (limiter, pool, queue, WAF, alerts), update the matching row’s **Status** and **Evidence**.  
2. Re-count the executive summary table.  
3. Bump **Last reviewed**.  
4. Move closed backlog items out and promote the next gaps.  
5. Prefer 🔍 over ✅ for anything that only exists in a cloud console until an operator attests it (same pattern as `SECURITY_OPS_ATTESTATION.md`).
