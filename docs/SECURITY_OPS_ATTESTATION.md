# Forma — Security ops attestation

Human sign-off for checklist items that cannot be proven in CI. Fill before each production promote.

Related: [SECURITY_PENTEST_CHECKLIST.md](./SECURITY_PENTEST_CHECKLIST.md) · [DOMAIN_NETWORKING.md](./DOMAIN_NETWORKING.md)

## 0.2 — Test secrets unique vs production

| Check | Done |
|-------|------|
| Test/Render `JWT_SECRET` ≠ Railway prod `JWT_SECRET` | ☐ |
| Test `PLATFORM_JWT_SECRET` ≠ prod | ☐ |
| Test Mongo URI / DB name ≠ prod cluster | ☐ |
| Test Brevo key ≠ prod (or empty in test) | ☐ |
| Local `.env` is gitignored and not shared in chat/tickets | ☐ |

Evidence: env console screenshots or ticket ID: _______________

Attested by: _______________ Date: _______________

## 12.9 — Cloud dashboard least privilege

| Check | Done |
|-------|------|
| Railway prod: no shared owner login for contractors | ☐ |
| Vercel: deploy role limited; production protect as needed | ☐ |
| Cloudflare R2: API tokens scoped to one bucket / least privilege | ☐ |
| Brevo: sending identity limited; API key not in frontend | ☐ |
| Offboarding removes dashboard access same day | ☐ |

Attested by: _______________ Date: _______________

## 15.3 — R2 keys scoped per environment

| Check | Done |
|-------|------|
| Prod bucket token cannot write test/staging bucket (and reverse) | ☐ |
| Test uses distinct `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | ☐ |
| `R2_BUCKET_NAME` for test ≠ prod (or separate account) | ☐ |
| Rotated any key that was ever pasted into a ticket/chat | ☐ |

Attested by: _______________ Date: _______________

## Optional hygiene script

From `Backend`:

```bash
node scripts/ops/checkEnvHygiene.js
```

This validates local placeholder hygiene and distinct JWT names only — it does **not** replace the prod diffs above.
