# Backup and Restore

## Policy

Production PostgreSQL and object storage must use encrypted provider-managed backups with retention approved by the data owner. Initial targets are **RPO 24 hours** and **RTO 4 hours** until a human owner approves stricter targets.

## Backup requirements

- automated daily database backups plus provider point-in-time recovery where available;
- encryption in transit and at rest;
- access restricted to named operators and audited service identities;
- retention and deletion aligned with the approved privacy policy;
- backup failure alert routed to an owner;
- no secrets stored in repositories, evidence files or support tickets.

## Isolated restore drill

1. Create an isolated non-production database with no public access.
2. Restore the selected backup using provider-approved tooling.
3. apply only forward-compatible reviewed migrations when required;
4. start the exact approved web/API artifacts against the restored database;
5. run readiness, catalog, authentication, pilot journey, progress and reward-integrity smoke checks;
6. compare row counts and critical invariants without exporting personal data;
7. record backup timestamp, restore duration, release SHA, defects and operator approval;
8. destroy the isolated environment after evidence is retained.

## Production restoration

Never restore directly over a live database without an approved incident decision, a preserved pre-restore snapshot, a written traffic plan and rollback point. Application recovery must be verified before traffic resumes.
