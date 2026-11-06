# Leap Gym

Sales-assisted multi-tenant gym platform. Platform operators onboard a gym, the owner sets a password from the invite link, and billing is confirmed from a manual bank transfer.

## Applications

- `Frontend` — gym app and platform console (`/platform`). Deployed on Vercel.
- `Backend` — Express API. Deployed on Render. Bind address is `0.0.0.0` and the port comes from `PORT`.

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

`STORAGE_DRIVER=local` (the default) writes to `Backend/uploads`. Use that for development.

Production on Render must set `STORAGE_DRIVER=r2`. The disk is wiped on restart. Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME`. Objects are stored as `{tenantId}/{filename}`. The API still authorizes `GET /uploads/:filename` and streams the object. Logos redirect to `R2_PUBLIC_URL` when that variable is set.

`npm run migrate:uploads` only moves an existing local `uploads/` tree into `uploads/{tenantId}/` on a machine that still has those files. Objects created after the R2 switch live in the bucket.

## Production

- Frontend: Vercel project whose build is defined in `vercel.json`. Set `BACKEND_ORIGIN` to the Render URL before building.
- Backend: Render web service from `render.yaml` (`rootDir: Backend`, `npm install`, `npm start`). Put secrets in the Render dashboard. Do not commit them.
- Set `FRONTEND_ORIGIN` on the API to the Vercel origin so invite and reset links point at the app.
- Health check path is `/`.

## Tests

From `Backend`:

```bash
npm test
```
