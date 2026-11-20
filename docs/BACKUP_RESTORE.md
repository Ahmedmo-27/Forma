# Backup and Restore Runbook

Forma keeps all state in two places:

| Store | What lives there | Backed up by |
| --- | --- | --- |
| MongoDB Atlas (`MONGO_URI`) | Tenants, members, subscriptions, payments, audit logs, contract signatures, WhatsApp sessions | Nightly `mongodump` workflow, plus Atlas snapshots on paid tiers |
| Cloudflare R2 (`R2_BUCKET_NAME`) | Member photos and ID scans, keyed as `<tenantId>/<file>` | `rclone` copy to the backups bucket (see "Uploads" below) |

Railway and Render containers have ephemeral disks. Nothing on the API host needs backing up.

Targets: **RPO 24 hours** (nightly dumps; better with Atlas continuous backup) and **RTO 1 hour** for a full restore, 15 minutes for a single gym.

---

## 1. One-time setup

1. **Create a separate R2 bucket** for backups, for example `forma-backups`. Never reuse the uploads bucket.
2. In that bucket, add a **lifecycle rule** that deletes objects under `mongo/` after 35 days and objects under `uploads/` after 35 days.
3. Create an **R2 API token** scoped to *Object Read & Write* on `forma-backups` only.
4. Create a **read-only Atlas database user** (role `backup` or `readAnyDatabase`) for dumps.
5. Add these **GitHub Actions secrets**:

   | Secret | Value |
   | --- | --- |
   | `BACKUP_MONGO_URI` | `mongodb+srv://<backup-user>:<pw>@<cluster>/forma` |
   | `BACKUP_PASSPHRASE` | Long random string. Store a copy in the team password manager: without it, backups cannot be decrypted. |
   | `BACKUP_BUCKET` | `forma-backups` |
   | `BACKUP_S3_ENDPOINT` | `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` |
   | `BACKUP_ACCESS_KEY_ID` / `BACKUP_SECRET_ACCESS_KEY` | From step 3 |

6. Run **Actions → Nightly database backup → Run workflow** once and confirm a `mongo/forma-*.archive.gz.enc` object appears in the bucket.
7. **Paid Atlas tier (M10+):** also enable *Cloud Backup* with continuous backup or point-in-time restore. That is the fastest restore path. The nightly dump is the off-provider copy.

## 2. What runs automatically

- `.github/workflows/mongo-backup.yml` runs daily at 01:15 UTC. It runs `Backend/scripts/ops/mongo-backup.sh`, which:
  - dumps every collection with `mongodump --gzip`;
  - encrypts the archive with AES-256 (`BACKUP_PASSPHRASE`);
  - refuses to upload an archive under 1 KB;
  - uploads it to `s3://$BACKUP_BUCKET/mongo/`.
- A failed run triggers GitHub's standard failure email to workflow watchers. Check the Actions tab weekly.

### Uploads (R2 to R2)

R2 has no built-in versioning, so copy uploads into the backups bucket on a schedule. Run this from any ops machine or a cron service with `rclone` configured for both buckets:

```bash
rclone sync r2:forma r2:forma-backups/uploads --fast-list --checksum
```

Run it weekly at minimum. Photos change rarely, and MongoDB holds the references.

## 3. Restore drills (monthly)

Do this once a month and record the date and duration in `docs/PRODUCTION_CHECKLIST.md`:

1. Download the latest archive: `aws s3 cp s3://forma-backups/mongo/<file> . --endpoint-url $BACKUP_S3_ENDPOINT`
2. Restore it into a scratch database (step 4a).
3. Check counts against production:
   `mongosh "$RESTORE_URI" --eval 'db.tenants.countDocuments(); db.members.countDocuments()'`
4. Drop the scratch database.

## 4. Restore procedures

Requirements: MongoDB Database Tools (`mongodump`/`mongorestore`), `openssl`, Node 20, and the AWS CLI. Run the scripts from `Backend/`.

### 4a. Restore into a scratch database (always the first step)

```bash
export BACKUP_PASSPHRASE='...'
export RESTORE_URI='mongodb+srv://<admin>:<pw>@<cluster>/forma_restore'
bash scripts/ops/mongo-restore.sh ./forma-2026-11-20T01-15-00Z.archive.gz.enc
```

The script maps `forma.*` to the database named in `RESTORE_URI`, so it never writes into production unless you point it there. If the source database had another name, set `SOURCE_DB`.

### 4b. One gym lost or corrupted data (most common)

Use this for a mistaken bulk delete or a bad import affecting a single tenant.

1. Restore the backup into a scratch database (4a).
2. Dry run, which shows per-collection counts and writes nothing:

   ```bash
   node src/scripts/restoreTenantFromBackup.js \
     --from "mongodb+srv://<admin>:<pw>@<cluster>/forma_restore" \
     --tenant <tenantId-or-slug>
   ```

   The target defaults to `MONGO_URI`. Pass `--to` to override it.
3. Apply it: add `--apply`. By default only **missing** documents are re-inserted, and anything created since the backup is kept. Add `--overwrite` to also roll back documents edited since the backup.
4. Clear the cache and verify. The API response cache lives in memory on each instance, so restart the API service on Railway or wait 5 minutes for it to expire. Then spot-check the gym's members and payments.
5. Write an audit note on the tenant: what was restored, from which backup, and why.

Platform-wide collections (plans, features, platform users, settings, scheduler locks) are never copied by this script.

### 4c. Full database loss or bad deploy corruption

1. Enable **maintenance mode** (Platform console → System health & settings) so writes stop. If the API is down, scale the service to 0 on Railway.
2. Paid Atlas tier: restore the cluster snapshot or point-in-time restore from the Atlas UI and skip to step 5.
3. Otherwise, restore into a new database (4a), with `RESTORE_URI` pointing at `.../forma_new`.
4. Verify counts, then update `MONGO_URI` on Railway to the new database and redeploy. Only use `--drop` against the live database name as a last resort; the script asks you to type the database name to confirm.
5. Run `npm run migrate:indexes` against the restored database.
6. Turn off maintenance mode. Tell affected gyms that data written after the backup timestamp has to be re-entered.

### 4d. Uploads lost

```bash
rclone copy r2:forma-backups/uploads r2:forma --fast-list
```

For one gym, add `--include "<tenantId>/**"`.

## 5. Security notes

- Dumps contain personal data (member names, phones, national IDs). They are encrypted before leaving the runner, and the backups bucket must stay private (no public URL).
- Rotate `BACKUP_PASSPHRASE` yearly. Old archives still need the old passphrase until they expire, so keep both in the password manager for 35 days.
- Delete local copies (`*.archive.gz`) after a restore drill.
- Tenant purges (GDPR) cannot reach backups. Purged data ages out within 35 days through the lifecycle rule. Document this in the privacy policy.
