# App backup and restore

Open any admin hub page and expand **Backup and restore**. Download a JSON backup and keep it securely; it contains private application records and is signed, not encrypted.

Select the file to verify its signature and preview its date and collection count. Download a current backup before restoring. Type `RESTORE` and click **Restore backup** to replace app data. Records added since the backup are removed. Restores run in the existing PostgreSQL transaction and advisory lock; a failed write rolls back the entire operation. Successful restores add an audit entry.

Backups include non-admin app profiles and all persisted app record collections: services, bookings, billing, messages, reports, withdrawals, schedules, and notification reads. Embedded documents/images are included. Administrator profiles and authentication identities are preserved in place. Clerk/Supabase sign-in accounts, passwords, phone-verification state, database schema, environment configuration, and external file contents are not backed up. This feature restores app data in the existing system; use infrastructure backups for full disaster recovery. Restoring payment records does not reverse real transfers.

The server signs backups with `BACKUP_SIGNING_SECRET`, falling back to the existing `SUPABASE_DB_URL`. For stable backup verification across database credential rotations, configure a long random `BACKUP_SIGNING_SECRET` before making backups and retain it securely outside the backup file. Changing the effective signing key makes older files unverifiable unless the original key is restored. Never use a `NEXT_PUBLIC_` variable for the signing key.

The app rejects exports whose restore request would exceed 11 MB; uploads are capped at 11 MB. Larger datasets require infrastructure backup tools. Backups are manual downloads; no schedule or off-site retention is configured by this feature.

Run `node --test tests/backup.cjs` to exercise an actual local PostgreSQL-compatible database round trip, access control, tamper rejection, rollback, and identity preservation.
