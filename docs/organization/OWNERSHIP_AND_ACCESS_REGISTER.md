# Ownership and Access Register

This register identifies accountable owners and access-review responsibilities. It must not contain passwords, private keys or complete tokens.

## Required roles

| Role | Scope | Current owner | Required backup/deputy | Review cadence | Status |
|---|---|---|---|---|---|
| Product owner | product scope, launch acceptance and repository disposition | `waseem99` pending confirmation | required | per release | provisional |
| GitHub organization administrator | organization, repositories, teams, Apps and audit log | unknown | required | quarterly | owner-required |
| Security and secrets owner | credential rotation, scanning, incident response and access exceptions | unknown | required | monthly/incident | owner-required |
| Infrastructure/release owner | Railway, domains, CI/CD, environments, promotion and rollback | unknown | required | per release | owner-required |
| Database/data-retention owner | PostgreSQL, legacy MongoDB, backups, migration, retention and deletion | unknown | required | monthly/per migration | owner-required |
| Payments owner | JazzCash, settlement, reconciliation, refunds and financial access | unknown | required | per release/monthly | owner-required |
| OTP/email owner | provider, sender domain, deliverability and abuse controls | unknown | required | monthly | owner-required |
| AI owner | DeepSeek/provider controls, prompts, evaluations, budgets and worker operations | unknown | required | per model/release | owner-required |
| Admin/content owner | CMS, publication, moderation, support and content quality | unknown | required | weekly/release | owner-required |
| Accessibility/discoverability owner | accessibility, SEO/AEO/GEO and public content quality | unknown | required | per release | owner-required |
| Mobile signing/store owner | Android/iOS keys, Play/App Store and Firebase/push/IAP accounts | unknown | required | quarterly/release | owner-required |
| Legal/licence owner | third-party code/assets, Ranchers ownership and retention obligations | unknown | required | per decision | owner-required |
| Incident commander | production incidents, communication, rollback and postmortem | unknown | required | per incident | owner-required |

## Repository ownership

| Repository | Business owner | Technical owner | Security owner | Final disposition approver | Status |
|---|---|---|---|---|---|
| `SkillStep/skillup-platform` | `waseem99` pending confirmation | unknown | unknown | product + security + release owners | active; owners incomplete |
| `SkillStep/python` | unknown | unknown | unknown | product + security + technical owners | security hold |
| `SkillStep/frontend` | unknown | unknown | unknown | product + security + technical owners | security hold |
| `SkillStep/web-admin` | rightful Ranchers/external owner unknown | unknown | unknown | legal/business owner | ownership exception |
| `SkillStep/backend` | unknown | unknown | unknown | product + data + security owners | security hold |
| `SkillStep/mobile-app` | unknown | unknown | unknown | product + mobile-signing + legal owners | security hold |

## Access-review checklist

For each repository and provider:

- [ ] organization owners and members;
- [ ] repository collaborators and teams;
- [ ] GitHub/GitLab Apps and OAuth integrations;
- [ ] deploy keys and machine users;
- [ ] CI runners and service accounts;
- [ ] environment and production approvers;
- [ ] cloud/IAM roles and API users;
- [ ] database users and backup access;
- [ ] domain/DNS and certificate access;
- [ ] mobile store, signing and Firebase access;
- [ ] payment, OTP, email and AI provider access;
- [ ] incident-response and break-glass access;
- [ ] leavers, inactive users and shared accounts.

## Least-privilege rules

- High-risk changes require independent review.
- Production deployment must require a protected environment approval.
- Payment, content publication and security administration should not share unrestricted access by default.
- Shared human credentials are prohibited.
- Break-glass access must be time-bound, logged and reviewed.
- Service accounts require a purpose, owner, minimum permissions and rotation schedule.
- Unknown ownership blocks production authorization and destructive legacy actions.

## Evidence

For every access review, record:

- review date;
- reviewer;
- system/account;
- users/roles reviewed;
- removals or permission reductions;
- exceptions and expiry dates;
- provider audit event or redacted evidence;
- next review date.

## Release gate

Production authorization requires named owners for security, infrastructure/release, database, payments, OTP/email, AI and incident response, plus independent review coverage for high-risk code and configuration.
