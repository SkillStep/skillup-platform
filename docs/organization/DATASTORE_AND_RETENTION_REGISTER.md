# Datastore and Retention Register

This register tracks databases, buckets, queues, backups and logs associated with the SkillStep organization. Do not record credentials or personal data here.

## Status values

- `unknown`
- `discovery-required`
- `active-approved`
- `migration-required`
- `retention-review`
- `backup-verified`
- `decommission-ready`
- `decommissioned`

## Register

| ID | Repository/system | Store type | Environment/region | Data categories | Active consumers | Owner | Status | Required decision | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| DATA-001 | `skillup-platform` | PostgreSQL | staging/production pending | accounts, sessions, learning, progress, payments, entitlements, admin/audit, AI operations | canonical web/API/worker | unknown | discovery-required | provision, classify, back up and test restore | pending |
| DATA-002 | `skillup-platform` AI worker | queue/artifact storage | deployment design pending | AI jobs, prompts after filtering, outputs, evaluations, cost metadata | canonical API/admin/worker | unknown | migration-required | use approved persistent storage and retention rules | pending |
| DATA-003 | `python` | generated logs/files and object storage | unknown | prompts, outputs, generated media, possible user input | legacy AI service | unknown | retention-review | classify, remove secrets/personal data, retain only approved evidence | pending |
| DATA-004 | `backend` | MongoDB clusters/collections | unknown | possible accounts, OTP, profiles, content, gameplay and other QRK data | legacy APIs/clients unknown | unknown | discovery-required | identify active data, retention and migration need | pending |
| DATA-005 | `backend` | logs/backups/files | unknown | operational and possibly personal data | unknown | unknown | discovery-required | inventory and classify before shutdown | pending |
| DATA-006 | `mobile-app`/Firebase | analytics, crash, push, storage and remote config | unknown | device/app identifiers, events, media, push tokens | legacy app/install base unknown | unknown | discovery-required | verify projects, users and retention; export/delete/transfer as approved | pending |
| DATA-007 | `mobile-app` | store/IAP records | Google Play/App Store accounts unknown | purchases, subscriptions, release and financial records | legacy native app | unknown | retention-review | verify owner and statutory/business retention | pending |
| DATA-008 | `web-admin`/Ranchers | GraphQL/API data and logs | unknown | unrelated business/order/branch/tax/rider data | Ranchers operations unknown | unknown | retention-review | determine rightful owner; do not migrate to SkillUp | pending |
| DATA-009 | legacy object storage | S3/CDN/uploads/media | unknown | generated or uploaded media | legacy services/apps | unknown | discovery-required | inventory ownership, malware/privacy and retention | pending |

## Required classification

For every store, identify whether it contains:

- personal identifiers;
- authentication, session or OTP data;
- learner profile, progress or assessment data;
- payment, entitlement or financial data;
- admin/audit/security records;
- AI prompts, outputs or moderation records;
- device, push, analytics or attribution identifiers;
- uploaded/generated media;
- unrelated third-party business data;
- credentials or secret material.

## Migration and decommission procedure

1. Identify account, region, store and owner.
2. Identify active applications, users and credentials.
3. Classify data and applicable retention obligations.
4. Freeze writes or define a final synchronization point where needed.
5. Create and verify an encrypted backup before destructive action.
6. Define field-level migration, deduplication and identity mapping.
7. Reconcile source and destination counts and invariants.
8. Test application behavior and rollback.
9. Apply approved retention, anonymization or deletion.
10. Revoke access and confirm decommissioning.

## Rules

- Never copy production data into GitHub or unapproved fixtures.
- Never migrate unrelated Ranchers data into SkillUp.
- Personal or payment data requires explicit privacy/security approval.
- Deletion requires accountable approval and verified backup/retention decisions.
- Backups must have an owner, encryption, access control, expiry and restore evidence.

## Release gate

Production authorization requires:

- canonical PostgreSQL backup and isolated restore evidence;
- known ownership and retention for every active canonical store;
- no unmanaged legacy datastore serving SkillUp users or callbacks;
- completed disposition for any legacy personal, payment or authentication data;
- tested rollback for schema and application changes.
