# Forma

Sales-assisted multi-tenant gym platform. Platform operators onboard a gym, the owner sets a password from the invite link, and billing is confirmed from a manual bank transfer.

## Applications

- `Frontend` — one Vercel SPA, split by hostname in production:
  - **`www.forma-official.com`** (apex → www) — public marketing, plans, signup
  - **`app.forma-official.com`** — gym staff login, tenant dashboards, `/platform` console
- `Backend` — Express API. Bind `0.0.0.0` and use `PORT`.
  - **Production:** Railway (`api.forma-official.com`)
  - **Testing:** Render (`render.yaml` / default `*.onrender.com` — no custom domain)

Domain, DNS, CORS, and cutover details: [docs/DOMAIN_NETWORKING.md](docs/DOMAIN_NETWORKING.md).

## Local setup

1. Copy `Backend/.env.example` to `Backend/.env` and set `MONGO_URI`, `JWT_SECRET`, `PLATFORM_JWT_SECRET`, and `TENANT_SECRET_KEY`.
2. Copy `Frontend/.env.example` to `Frontend/.env` and set `BACKEND_ORIGIN` (for example `http://localhost:5000`). Vite injects this at build time.
3. Install and start the API from `Backend`:

```bash
npm install
npm run dev
```

4. Install and start the frontend from `Frontend`:

```bash
npm install
npm run dev
```

5. Bootstrap an empty database from `Backend`, in this order:

```bash
npm run seed:plans
npm run seed:prices
npm run seed:superadmin
```

`seed:superadmin` creates the local platform operator defined in `Backend/src/scripts/seedSuperAdminUser.js`. Change that password before any shared environment. Sign in at `/platform/login`.

## Onboarding a gym

1. In the platform console, create a tenant. The response includes a 72-hour invite URL, and the same link is emailed when SMTP is configured.
2. The owner opens `/auth/setup-password`, chooses a password, then signs in at `/login`. Owners land on `/owner/dashboard`.
3. If the invite is lost, the owner can request a new link from `/auth/forgot-password`. The API always returns the same message, whether or not the email exists.

Leave `SMTP_HOST` unset in local development. Invites are skipped and the console still shows the copyable link.

## Billing

Manual bank transfer is the live payment method. Set `PAYMENT_BANK_NAME`, `PAYMENT_ACCOUNT_NAME`, `PAYMENT_IBAN`, and `PAYMENT_SWIFT`. Production checkout fails closed when the bank name, account name, or IBAN is empty. Confirming a payment issues an invoice and emails it to the gym owner when SMTP is set.

## File storage

Persisted uploads go to Cloudflare R2 bucket `forma` on the account signed in as `forma.gms1@gmail.com`.

Set `R2_ACCOUNT_ID=f7cd61e729b00936ed5f88b6833f5aa8` and `R2_BUCKET_NAME=forma`. The S3 endpoint is `https://f7cd61e729b00936ed5f88b6833f5aa8.r2.cloudflarestorage.com`. Create an R2 API token scoped to bucket `forma` with Object Read and Write, then set `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`. The server exits on startup if any of those four values is missing. Leave `R2_PUBLIC_URL` empty.

Objects are stored as `{tenantId}/{filename}`. Profile photos, national IDs, invitation ID scans, and tenant logos are written only to that bucket. The API still authorizes `GET /uploads/:filename` and streams the object. Logos redirect to `R2_PUBLIC_URL` only when that variable is a public bucket domain. Excel imports are parsed in memory and are not stored.

On Railway (production) and Render (testing), set `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` in each service dashboard. Do not commit the key pair. Leave `R2_PUBLIC_URL` unset. Use separate secrets per environment.

## Production

- **Domain:** `forma-official.com` — see [docs/DOMAIN_NETWORKING.md](docs/DOMAIN_NETWORKING.md).
- **Frontend (Vercel):** build from `vercel.json`. Set `BACKEND_ORIGIN=https://api.forma-official.com` (include `https://`) before building. Attach `app`, `www`, and optional `platform` / apex.
- **API (Railway):** custom domain `api.forma-official.com`. Set `FRONTEND_ORIGIN` with `https://app.forma-official.com` listed first (then `www` / `platform`) so invite and reset links hit the gym app. Set `BASE_DOMAIN=forma-official.com`, production `PAYMENT_*`, and production secrets. Do not commit secrets.
- **Testing API (Render):** keep the default `*.onrender.com` URL from `render.yaml`. Do not attach `forma-official.com`. Point local/preview `BACKEND_ORIGIN` at Render only for test work.
- Health check path is `/`.

## Tests

From `Backend`:

```bash
npm test
```
