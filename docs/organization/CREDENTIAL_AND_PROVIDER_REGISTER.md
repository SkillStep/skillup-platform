# Credential and Provider Register

This document tracks credential classes and provider ownership only. **Never record secret values, private keys, OTP secrets, passwords or complete tokens.**

## Status values

- `unknown`
- `inventory-required`
- `revocation-required`
- `rotation-required`
- `rotated-and-tested`
- `revoked`
- `approved-public-config`
- `exception-with-expiry`

## Register

| ID | Provider/system | Credential class | Repository evidence | Environment/purpose | Owner | Status | Required action | Evidence | Retest dependency |
|---|---|---|---|---|---|---|---|---|---|
| CRED-001 | GitHub | PATs, Apps, deploy keys, Actions/environment secrets | organization-wide | source, CI and releases | unknown | inventory-required | review access and rotate/revoke legacy credentials | pending | canonical CI/release |
| CRED-002 | GitLab | deploy tokens, runners, CI variables, SSH keys | all legacy repositories reference GitLab history | legacy CI/deployment | unknown | revocation-required | inventory projects/runners and disable/revoke | pending | none unless active dependency found |
| CRED-003 | Railway | project/service tokens and variables | canonical and possible legacy deployment references | staging/production | unknown | inventory-required | identify canonical projects; revoke legacy access | pending | web/API/worker deployment |
| CRED-004 | Vercel/Netlify | deploy hooks, tokens and variables | legacy clients/admin | historical hosting | unknown | inventory-required | disable legacy hooks/sites or document exception | pending | domain verification |
| CRED-005 | AWS/S3/CDN | access keys, bucket policies, signed access | `python`, possible mobile/backend | generated media/storage | unknown | rotation-required | identify buckets/accounts; rotate/revoke and restrict | pending | approved object storage |
| CRED-006 | Firebase | app config, service accounts, server credentials | `frontend`, `mobile-app` | auth, push, analytics, storage/distribution | unknown | inventory-required | verify projects/owners; rotate sensitive server access | pending | mobile disposition |
| CRED-007 | Android | debug/upload/app-signing keys and passwords | `frontend`, `mobile-app` | app builds/releases | unknown | inventory-required | verify Play App Signing and rotate exposed material safely | pending | store release decision |
| CRED-008 | Apple | certificates, profiles and App Store Connect keys | `mobile-app` | iOS builds/releases | unknown | inventory-required | verify ownership and revoke obsolete access | pending | store release decision |
| CRED-009 | AI providers | OpenAI/DeepSeek/other API keys | `python`, canonical AI | generation/evaluation | unknown | rotation-required | revoke legacy keys; issue approved canonical DeepSeek key | pending | #73/#78 |
| CRED-010 | Twilio/SMS/OTP | account credentials and messaging configuration | `backend`, legacy clients | OTP/SMS | unknown | inventory-required | verify use; revoke legacy credentials | pending | OTP provider decision |
| CRED-011 | SMTP/email | usernames, passwords/API keys and sender config | `backend`, canonical auth | email OTP | unknown | inventory-required | choose approved provider; revoke legacy credentials | pending | #71/#78 |
| CRED-012 | Mapbox | client/server tokens | `web-admin` | unrelated Ranchers maps | unknown | revocation-required | notify rightful owner and revoke/transfer safely | pending | web-admin disposition |
| CRED-013 | payment providers | merchant credentials, salts and webhook secrets | legacy unknown; canonical JazzCash planned | payments | unknown | inventory-required | revoke legacy; obtain approved JazzCash sandbox/production credentials | pending | #74/#78 |
| CRED-014 | databases | MongoDB/PostgreSQL users and URLs | `backend`, canonical platform | application data | unknown | inventory-required | identify active stores; rotate credentials and apply least privilege | pending | data migration/deployment |
| CRED-015 | push/analytics/crash | OneSignal, FCM/APNs, analytics and crash keys | `mobile-app` | mobile operations | unknown | inventory-required | identify accounts; revoke or transfer | pending | mobile disposition |
| CRED-016 | external upload/diagnostic services | API/client tokens | legacy clients/services | uploads and diagnostics | unknown | inventory-required | identify endpoints and revoke access | pending | deployment shutdown |

## Rotation procedure

1. Identify the provider account and accountable owner.
2. Determine whether the credential is currently used.
3. Preserve required audit evidence without exposing the value.
4. Revoke unused credentials immediately.
5. Rotate required credentials into an approved secret store.
6. Remove obsolete users, service accounts and deploy keys.
7. Retest only approved canonical services.
8. Record evidence ID, completion date and reviewer.
9. Add an expiry date and compensating controls for every exception.

## Release gate

Production authorization is blocked while any credential affecting production, authentication, payments, personal data, deployment or signing remains `unknown`, `inventory-required`, `rotation-required` or `revocation-required` without an approved exception.
