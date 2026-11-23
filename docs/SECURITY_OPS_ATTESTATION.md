# Forma — Security ops attestation

Human sign-off for checklist items that cannot be proven in CI. Fill before each production promote.

Related: [SECURITY_PENTEST_CHECKLIST.md](./SECURITY_PENTEST_CHECKLIST.md) · [DOMAIN_NETWORKING.md](./DOMAIN_NETWORKING.md)

**Status:** All sections below attested **2026-11-17** (operator confirmed covered).

## 0.2 — Test secrets unique vs production

| Check | Done |
|-------|------|
| Test/Render `JWT_SECRET` ≠ Railway prod `JWT_SECRET` | ☑ |
| Test `PLATFORM_JWT_SECRET` ≠ prod | ☑ |
| Test Mongo URI / DB name ≠ prod cluster | ☑ |
| Test Brevo key ≠ prod (or empty in test) | ☑ |
| Local `.env` is gitignored and not shared in chat/tickets | ☑ |

Evidence: operator confirmation 2026-11-17

Attested by: Operator Date: 2026-11-17

## 12.9 — Cloud dashboard least privilege

| Check | Done |
|-------|------|
| Railway prod: no shared owner login for contractors | ☑ |
| Vercel: deploy role limited; production protect as needed | ☑ |
| Cloudflare R2: API tokens scoped to one bucket / least privilege | ☑ |
| Brevo: sending identity limited; API key not in frontend | ☑ |
| Offboarding removes dashboard access same day | ☑ |

Attested by: Operator Date: 2026-11-17

## 15.3 — R2 keys scoped per environment

| Check | Done |
|-------|------|
| Prod bucket token cannot write test/staging bucket (and reverse) | ☑ |
| Test uses distinct `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | ☑ |
| `R2_BUCKET_NAME` for test ≠ prod (or separate account) | ☑ |
| Rotated any key that was ever pasted into a ticket/chat | ☑ |

Attested by: Operator Date: 2026-11-17

## Optional hygiene script

From `Backend`:

```bash
node scripts/ops/checkEnvHygiene.js
```

This validates local placeholder hygiene and distinct JWT names only — it does **not** replace the prod diffs above.

---

## Availability ops (Wave B) — attest before marking checklist 🔍 → ✅

Related: [availability-security-checklist.md](./availability-security-checklist.md) · [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) · [BACKUP_RESTORE.md](./BACKUP_RESTORE.md)

**Constraint:** Redis is **not** in use. Keep Railway API **replicas = 1**.

| Check | Done | Notes |
|-------|------|-------|
| Railway: CPU alert configured | ☐ | |
| Railway: memory / OOM alert configured | ☐ | |
| Railway: replicas pinned to **1** | ☐ | |
| Railway: **Wait for CI** enabled | ☐ | |
| Atlas: connection count alert | ☐ | |
| Atlas: disk / storage alert | ☐ | |
| Atlas: replication lag / member health alert | ☐ | |
| Atlas: slow query / Performance Advisor watched | ☐ | |
| Atlas Network Access IPs documented | ☐ | |
| Uptime check: `https://api.forma-official.com/health` | ☐ | |
| Uptime check: SPA (`app` / `www`) | ☐ | |
| Status page subscriptions (Railway, Vercel, Atlas, Cloudflare, Brevo) | ☐ | |
| IR owner named for CF / Railway / Atlas incidents | ☐ | Name: ________ |
| Registrar domain lock | ☐ | |
| Deletion protection / who can destroy Atlas, Railway, R2 | ☐ | |
| Secret rotation calendar (R2, Brevo, Atlas backup, Actions) | ☐ | |
| DNS change notification / dual-control for zone edits | ☐ | |
| Restore drill: one tenant restored + date stamped | ☐ | Date: ________ |
| R2 upload backup sync (rclone) scheduled or run | ☐ | |

Attested by: ________ Date: ________
