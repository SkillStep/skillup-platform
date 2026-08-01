# Administrative Bootstrap and Access

## Principles

- Administrative access is attached only to an existing active, verified SkillUp account.
- Roles are capability-based and checked by the API on every request.
- The browser cannot grant or infer administrative access.
- Role assignment, review, publication, reconciliation and entitlement correction create privileged audit evidence.
- Shared accounts are prohibited.
- Payment operators cannot publish content. Publishers cannot correct entitlements unless separately assigned.

## Available roles

| Role | Primary capability |
| --- | --- |
| `content_editor` | Create bounded AI generation requests and edit drafts |
| `content_reviewer` | Compare and review AI/content artifacts |
| `publisher` | Publish approved artifacts and roll back publication |
| `learner_support` | Read the minimum support timeline |
| `payment_operator` | Review payment evidence, reconcile and correct entitlement state |
| `analyst` | Read operational and commercial metrics |
| `security_admin` | Manage access policy and inspect privileged audit evidence |

Use the smallest role set needed for the person’s job.

## First administrator bootstrap

1. Deploy migrations with all commercial and AI features disabled.
2. Sign in normally with the intended administrator email so a verified account exists.
3. Open an isolated privileged shell with database access.
4. Set the following environment variables without saving them to shell history:

```text
ADMIN_BOOTSTRAP_EMAIL=<verified account email>
ADMIN_BOOTSTRAP_ROLES=security_admin,content_reviewer,publisher
ADMIN_BOOTSTRAP_REASON=<approved ticket/change reference and business reason>
ADMIN_BOOTSTRAP_CONFIRM=I_UNDERSTAND_THIS_GRANTS_PRIVILEGED_ACCESS
RELEASE_SHA=<deployed release SHA>
```

5. Run:

```bash
pnpm admin:bootstrap
```

6. Confirm the command reports the internal user UUID and assigned roles.
7. Sign out and back in, then open `/en/admin`.
8. Verify only the expected sections appear.
9. Confirm an `admin.bootstrap` audit event exists.
10. Remove the bootstrap environment variables and privileged shell access.

## Subsequent role changes

The initial bootstrap is not a routine role-management mechanism. Subsequent changes require:

- an approved access request;
- identity and employment verification;
- separation-of-duties review;
- explicit role list and expiry where temporary;
- audit evidence for assignment, extension, revocation and emergency suspension;
- quarterly access recertification.

Until a dedicated role-management UI is approved, make role changes through a reviewed operational procedure and append audit evidence. Do not edit audit records.

## Access review checklist

For every active administrator confirm:

- named owner and verified account;
- current role and business purpose;
- last successful administrative action;
- role expiry where temporary;
- no conflicting duties;
- no stale or shared credentials;
- offboarding status;
- access to deployment, database and provider consoles reviewed separately.

## Emergency response

For suspected administrative compromise:

1. Suspend the `admin_principal`.
2. Revoke the account’s active sessions.
3. Rotate affected deployment or provider credentials.
4. Preserve privileged audit evidence.
5. Review content publications, entitlement corrections and reconciliation decisions made by the account.
6. Roll back affected publication or access through append-only corrective actions.
7. Re-enable access only after security approval.
