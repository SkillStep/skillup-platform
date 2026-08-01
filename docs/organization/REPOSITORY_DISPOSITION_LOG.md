# Repository Disposition Log

This log records the approved end state of each SkillStep repository. A proposed disposition is not authorization to archive, transfer, delete or rewrite history.

## Status values

- `active-canonical`
- `security-hold`
- `migration-review`
- `ready-for-archive`
- `archived`
- `ready-for-transfer`
- `transferred`
- `deletion-review`
- `deleted`

## Current disposition

| Repository | Current status | Expected disposition | Blocking issues | Required approvals | Final evidence |
|---|---|---|---|---|---|
| `SkillStep/skillup-platform` | active-canonical | retain as sole production source | #69–#78, #81–#84 as applicable | product, security, release | pending |
| `SkillStep/python` | security-hold | archive read-only | `SkillStep/python#1`, #81, #82, #84 | product, security, AI/technical | pending |
| `SkillStep/frontend` | security-hold | archive read-only | `SkillStep/frontend#1`, #81, #82, #84 | product, security, web/mobile technical | pending |
| `SkillStep/web-admin` | security-hold | transfer to rightful owner or archive | `SkillStep/web-admin#1`, #81, #82, #84 | legal/business, security, rightful owner | pending |
| `SkillStep/backend` | security-hold | decommission and archive read-only | `SkillStep/backend#1`, #81, #82, #84 | product, data, security, technical | pending |
| `SkillStep/mobile-app` | security-hold | resolve stores/signing/assets and archive | `SkillStep/mobile-app#1`, #81, #82, #84 | product, mobile-signing, legal/licence, security | pending |

## Closure packet requirements

Every legacy repository must provide:

1. **Ownership** — right to retain, transfer, archive or delete.
2. **Security** — credentials/signing/access reviewed and resolved.
3. **Runtime** — deployments, domains, webhooks, schedulers and distribution disabled or migrated.
4. **Data** — databases, buckets, queues, backups and retention resolved.
5. **Migration** — approved items implemented or rejected with rationale.
6. **Assets** — provenance, licence, privacy and security reviewed.
7. **Repository preparation** — README security hold, issue/PR disposition and final reference SHA.
8. **Approvals** — business/product, technical, security and specialist owner sign-off.

## Change log template

Add one entry per approved status transition:

```text
Date:
Repository:
Previous status:
New status:
Decision:
Approvers:
Credential evidence:
Deployment evidence:
Data/retention evidence:
Migration/asset evidence:
Final commit/reference SHA:
Rollback or recovery consideration:
Notes:
```

## Final organization completion

Issue #85 may close only when:

- `skillup-platform` is the only repository capable of deploying SkillUp;
- all five legacy repositories are archived or transferred;
- no legacy credential or signing material remains valid unintentionally;
- no legacy domain, callback, scheduler, worker or distribution track is active;
- no unmanaged personal/payment/authentication data remains;
- every retained concept or asset has approved evidence and a canonical destination;
- this log contains the final approved state and evidence for all six repositories.
