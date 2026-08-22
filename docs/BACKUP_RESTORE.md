# SEALS Backup & Restore Runbook

MongoDB Atlas is the only system of record for application data. This runbook covers Atlas-managed backups, scheduled logical dumps with `backend/scripts/backup-mongodb.ps1`, restore procedures, and verification drills.

## 1. Backup strategy

### Atlas continuous backups (primary)

- Enable **Continuous Cloud Backup with Point-in-Time Recovery (PITR)** on the production cluster (available per Atlas tier — M10 and above). PITR restores to any second within the retention window and protects against logic errors (bad deployment deleting data) that snapshot-only strategies miss.
- Keep snapshots in the same cloud region as the cluster plus at least one other region if the tier allows.
- Verify the Atlas project has backup compliance/policy settings reviewed before launch.

### Scheduled dumps via script (secondary, off-platform copy)

`backend/scripts/backup-mongodb.ps1` produces compressed logical archives on any Windows machine with MongoDB Database Tools:

```powershell
$env:MONGODB_URI = "mongodb+srv://user:pass@cluster/db?retryWrites=true&w=majority"
.\backend\scripts\backup-mongodb.ps1 -OutputDirectory D:\backups
```

Behavior (verified against the script):

- Requires `MONGODB_URI` from the environment; throws if missing.
- Requires `mongodump` on PATH.
- Runs `mongodump --archive=<dir>\seals-yyyyMMdd-HHmmss.archive.gz --gzip`.
- The URI is passed through the environment variable — never as a command-line argument — so credentials do not appear in process listings or shell history.
- Prints the SHA256 hash of the archive; record it with the file for integrity checks.

Schedule it daily (Task Scheduler / cron wrapper) and copy archives off-site (object storage with versioning). Encrypt at rest.

**Retention recommendation**: daily archives kept 7 days, weekly kept 4 weeks, monthly kept 6 months. Apply the same review cadence to the Atlas snapshot schedule.

## 2. Media assets are NOT in Mongo dumps

Cloudinary-hosted images/videos are referenced by URL in MongoDB but the binaries live outside the database. Database backups alone cannot restore media.

- Maintain a separate **asset inventory export** (e.g. periodic export of all Cloudinary resource lists/JSON via the Admin API) stored with the backups.
- Document which collections hold media URLs (`products.images`, `posts`, organizations' avatar/cover fields, payment/dispute proof URLs) so a restored database can be reconciled against the inventory.
- Decide in advance whether disaster recovery re-uploads missing assets from the inventory or accepts broken references.

## 3. Restore procedure

Always rehearse against staging first.

```bash
# 1. Restore into a STAGING database (never straight to production)
mongorestore --archive=seals-20260822-030000.archive.gz --gzip \
  --nsInclude "seals_production.*" --drop \
  --uri "mongodb+srv://...@CLUSTER/seals_staging"
```

1. **Staging restore**: use `--drop` so the staging target matches the archive exactly. Confirm the API boots against staging (`/api/health/ready`) with the restored data.
2. **Verify counts against audit logs**: compare collection counts (`users`, `organizations`, `orders`, `payment_obligations`, `subscriptions`, `disputes`, `ratings`) between the archive metadata/audit logs and the restored staging database. Spot-check recent orders end-to-end in the staging UI. Validate the SHA256 of the archive before trusting a restore.
3. **Production cut-over**: once staging verifies clean,
   - put the API into maintenance (stop traffic: scale down or block at Caddy),
   - take a fresh pre-restore dump of current production (rollback point),
   - run the same `mongorestore --archive ... --gzip --drop` against the production database,
   - restart the stack and confirm `/api/health/live` + `/ready`,
   - smoke-test login, product listing, order status transitions.

## 4. Recovery verification drill

Run quarterly (and after any major release):

1. Pick the most recent archive; verify its SHA256 matches the recorded value.
2. Restore to a scratch/staging cluster; record elapsed time (this is your realistic RTO estimate).
3. Compare document counts per collection against the source and against audit-log expectations.
4. Exercise the app against the restored clone: register/login, open an order, submit a proof.
5. Confirm PITR works too: restore the Atlas cluster to a timestamp mid-day in a temporary cluster.
6. Document gaps (missing media, slow transfer, expired credentials) and fix them before the next drill.

## 5. Environment restoration checklist

Restoring data is useless without a runnable environment. Keep this checklist with the backups:

- [ ] Latest verified archive + SHA256 + its creation date.
- [ ] Current `backend/.env.production` values (stored in the secret manager, NOT next to backups): MongoDB URI, `NEXTAUTH_SECRET`, Cloudinary keys, SMTP credentials.
- [ ] Domain DNS records and where they point (server IP / load balancer).
- [ ] Docker host access (SSH key, `docker compose` availability) and the repository ref last deployed.
- [ ] Cloudinary account credentials + latest asset inventory export.
- [ ] SMTP provider account details.
- [ ] Cron scheduler entry for `POST /api/internal/maintenance` (with secret reference).
- [ ] Post-restore steps: recreate `.env.production` files → `docker compose up -d` → verify health endpoints → re-run admin bootstrap only if the users collection was replaced.
