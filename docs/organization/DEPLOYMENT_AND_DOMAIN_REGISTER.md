# Deployment and Domain Register

This register records every runtime, deployment trigger, domain, webhook, scheduler and distribution path associated with the SkillStep organization.

## Status values

- `unknown`
- `discovery-required`
- `active-approved`
- `active-unapproved`
- `shutdown-planned`
- `disabled`
- `migrated`
- `retained-nonproduction`

## Register

| ID | Source repository/branch | Provider/project/service | URL/domain | Trigger | Data/providers connected | Owner | Status | Required action | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| DEP-001 | `skillup-platform/main` | canonical Railway project | pending | reviewed immutable release | PostgreSQL, OTP, JazzCash, DeepSeek when approved | unknown | discovery-required | provision/verify staging and production under #77/#78 | pending |
| DEP-002 | `python/*` | GitLab/cloud/container runtimes | unknown | branch/CI/manual | AI providers, object storage | unknown | discovery-required | identify and disable all legacy runtimes | pending |
| DEP-003 | `frontend/*` | GitLab/mobile distribution/hosting | unknown | branch/CI/manual | Firebase, legacy APIs | unknown | discovery-required | disable builds, distribution and public routes | pending |
| DEP-004 | `web-admin/master` | GitLab/remote server/hosting | unknown | legacy CI and remote commands | Ranchers APIs, Mapbox, environment endpoints | unknown | active-unapproved | contain immediately; transfer or disable | pending |
| DEP-005 | `backend/*` | server/container/process runtimes | unknown | branch/CI/manual | MongoDB, Twilio, SMTP, Google APIs | unknown | discovery-required | identify consumers, preserve data, decommission | pending |
| DEP-006 | `mobile-app/dev` | GitLab/mobile CI, Play/TestFlight/internal distribution | unknown | CI/manual store release | Firebase, push, IAP, legacy APIs | unknown | discovery-required | disable legacy automation and verify installed-app dependencies | pending |

## Discovery checklist

- GitHub Actions workflows and environments
- GitLab projects, runners, variables and schedules
- Railway projects, services, databases, cron jobs and volumes
- Vercel projects, aliases and deploy hooks
- Netlify sites and build hooks
- Firebase Hosting, Functions and App Distribution
- AWS/S3/CDN/Lambda/ECS/EC2 or equivalent cloud workloads
- DNS records, subdomains, redirects and certificates
- Reverse proxies, load balancers and remote hosts
- Payment, OTP, email, push, AI and analytics callbacks
- Scheduled jobs, queues, workers and external automation
- Google Play, App Store and TestFlight tracks

## Required record for each discovered runtime

- provider account and project/service name;
- repository, branch and source commit;
- public/internal URL;
- domain and certificate owner;
- deployment trigger and credentials class;
- last activity/deployment date;
- user traffic and downstream consumers;
- databases, buckets, queues and providers;
- business and technical owner;
- backup/retention requirement;
- shutdown, migration or retention decision;
- rollback plan and evidence.

## Shutdown procedure

1. Verify whether users, payments, messages, callbacks or production data depend on the service.
2. Preserve approved logs and backups.
3. Define migration or user-impact plan where needed.
4. Disable automatic deploys, schedules and workers.
5. Repoint approved integrations to canonical services.
6. Disable webhooks and callbacks.
7. Revoke associated credentials through #81.
8. Remove or redirect DNS only with rollback.
9. Confirm branch pushes cannot reactivate deployment.
10. Record independent verification.

## Release gate

SkillUp cannot receive production authorization until:

- `skillup-platform` is the only deployable SkillUp source;
- no public SkillUp domain points to legacy code;
- no provider callback or scheduled job targets a legacy runtime;
- every retained non-production exception has an owner, access control and expiry;
- canonical staging and production routes have health, release identity and rollback evidence.
