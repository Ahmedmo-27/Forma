# Production checklist

Production API runs on **Railway** (`api.forma-official.com`). **Render** is the testing API only. The SPA runs on **Vercel**. See also [DOMAIN_NETWORKING.md](DOMAIN_NETWORKING.md) and [SECURITY_OPS_ATTESTATION.md](SECURITY_OPS_ATTESTATION.md).

## 1. Railway service settings

- Root directory: `Backend`. The service reads `Backend/railway.json` (start command `npm start`, health check `/health`, restart on failure, 15 s draining). If your root directory is not `Backend`, set the config-as-code path to `Backend/railway.json`.
- Optional: set watch paths to `Backend/**` and enable Wait for CI.
- Node 20 or newer (`engines.node`).

## 2. Environment variables (Railway, production values)

Required. The server refuses to boot without these, and in production it also refuses the placeholder values from `Backend/.env.example`.

| Variable | Notes |
| --- | --- |
| `NODE_ENV` | `production` |
| `MONGO_URI` | Real Atlas URI. No `<user>`/`<password>` placeholders. |
| `JWT_SECRET` | Unique, 32+ characters. |
| `PLATFORM_JWT_SECRET` | Unique, 32+ characters, different from `JWT_SECRET`. |
| `TENANT_SECRET_KEY` | 32 bytes, hex or base64. Never reuse across environments. |
| `FRONTEND_ORIGIN` | `https://app.forma-official.com` first, then `www` and `platform`. |
| `BASE_DOMAIN` | `forma-official.com` (shared `.forma-official.com` auth cookies). |
| `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Bucket-scoped token. Leave `R2_PUBLIC_URL` unset. |

Recommended or optional:

| Variable | Default | Notes |
| --- | --- | --- |
| `BREVO_API_KEY`, `MAIL_FROM`, `MAIL_FROM_SECURITY` | none | Without the key mail is skipped and logged. |
| `PAYMENT_PROVIDER_NAME`, `PAYMENT_GATEWAY_URL`, `PAYMENT_*` | `manual_transfer` | Production bank details. |
| `PLATFORM_IP_ALLOWLIST`, `PLATFORM_SESSION_TIMEOUT_MINUTES` | open, 60 | Restrict the platform console. |
| `LOG_LEVEL` | `info` | |
| `LOG_TO_FILE` | off in production | Railway collects stdout. |
| `MAINTENANCE_REMINDER_REPEAT_HOURS` | `24` | Minimum gap between reminders per branch. |
| `SHUTDOWN_GRACE_MS` | `10000` | In-flight request drain time on deploy. |
| `WHATSAPP_REPLY_GAP_MS` | `3000` | Minimum gap between inbox replies. |

Soft warnings at boot (the server still starts): secrets shorter than 32 characters, identical tenant and platform JWT secrets, missing `FRONTEND_ORIGIN`. Fix any warning you see in the Railway logs.

## 3. Scheduled jobs

Jobs start with the server (`startScheduledTasks`):

| Job | Cadence | Notes |
| --- | --- | --- |
| Freeze, expiry, sales and coach assignment | 30 min | Run at most once per interval across instances (`SchedulerLock`). |
| Analytics snapshots, owner billing mail | hourly | Idempotent. |
| Maintenance reminders | hourly, first run 2 min after boot | One digest per user per branch per `MAINTENANCE_REMINDER_REPEAT_HOURS`. |

The server must stay awake for jobs to run. Railway keeps it running. On Render free plan the service sleeps, so reminders only fire while it is awake.

## 4. Deploy

1. CI green on the commit (`Backend` isolation suite and full suite, `Frontend` lint and build, `npm audit`).
2. Deploy to **Render (testing)** first. Check `/health`, sign in, open Maintenance, and confirm a due item produces a bell notification.
3. Deploy to Railway. The old instance receives `SIGTERM`, drains for up to `SHUTDOWN_GRACE_MS`, and exits. The new instance must pass `/health` before taking traffic.
4. Vercel deploys the SPA with `BACKEND_ORIGIN=https://api.forma-official.com`.

## 5. Post-deploy smoke test

- `GET https://api.forma-official.com/health` returns `200` with `"status": "ok"`.
- Owner login on `app.forma-official.com` sets cookies for `.forma-official.com` and the dashboard loads.
- Maintenance page loads for a branch. Complete an item and see the status change.
- Create an item with a 1 hour interval and let it become due. Within an hour (or 2 minutes after a restart) the Owner and eligible staff get one "Maintenance reminder" in the bell. A second run in the same window creates no duplicate.
- A staff member without access to that branch, or without the maintenance area, receives nothing.
- WhatsApp inbox: an inbound message appears in `/inbox`, and a reply is delivered.
- Railway logs show JSON-ish lines on stdout and no `Missing required secrets` or placeholder errors.

## 6. Rollback

- Railway: redeploy the previous deployment from the Deployments tab. No data migration is required for this release.
- The new `Notification.dedupeKey` index and the `SchedulerLock` collection are additive. Old code ignores them.
- The `inbox` channel enum is now WhatsApp-only. Existing `instagram` or `messenger` channel rows from earlier tests are not read by the app and can be deleted from `inboxchannels`, `inboxconversations` and `inboxmessages`.

## 7. Known limits

- The scheduler lock only deduplicates within one MongoDB. It does not replace running a single API replica for WhatsApp sessions (Baileys sockets live in one process).
- A reminder is created at most once per window. An item that becomes due later in the same window is reminded in the next window.
