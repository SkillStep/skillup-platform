# SkillUp Pre-Deployment Handoff

**Purpose:** provide one authoritative boundary between completed repository work and the external inputs required to begin staging.

## 1. Repository status

The canonical source is `SkillStep/skillup-platform/main`.

Repository-side launch implementation is complete and includes:

- five reviewed launch skills;
- 68 levels and 204 challenges across all seven challenge formats;
- baseline/end assessments, remediation and recommendations;
- passwordless account, session, privacy, export and deletion lifecycle;
- progress, points, streaks, achievements, sharing and leaderboards;
- public skills, paths, guides, questions, comparisons and glossary content;
- premium capability authority and free daily mission enforcement;
- JazzCash-ready provider-independent commercial boundaries;
- admin content, publication, moderation, support, reporting and audit controls;
- consent-aware analytics and KPI queries;
- provider-neutral AI jobs, worker, budgets, review and publication boundaries;
- production containers, migrations, release gates and recovery tooling;
- organization governance and legacy migration registers.

No feature implementation from issues #70–#76 should be repeated merely because the original tracker text predates PR #88.

## 2. Source of truth

- Product and architecture: `README.md`, `docs/architecture/ARCHITECTURE.md`
- Staging: `docs/operations/RAILWAY_STAGING_DEPLOYMENT.md`
- Production gate: `docs/operations/PRODUCTION_READINESS.md`
- Organization/legacy controls: `docs/organization/README.md`
- External access handoff: GitHub issue #87
- Master deployment and acceptance work: issues #77 and #78

Legacy repositories are not authorized staging or production sources.

## 3. Required owner inputs before staging

Provide access through provider invitations or an approved secret manager. Do not paste secret values into GitHub or chat.

### Mandatory for initial web/API staging

- [ ] Confirm Railway as the staging provider, or approve an ADR to use AWS/another provider.
- [ ] Railway organization/project administrator invitation.
- [ ] Approved staging project name and staging hostname/domain.
- [ ] DNS operator or access if a custom staging domain is used.
- [ ] Approved SMTP/email provider.
- [ ] Verified sender address/domain and DNS owner for SPF, DKIM and DMARC.
- [ ] Staging SMTP credentials delivered through a protected channel.
- [ ] Named deployment owner and backup.
- [ ] Named rollback owner and backup.
- [ ] Named database/backup owner.
- [ ] Monitoring provider/project and alert recipients.
- [ ] Incident commander and escalation channel.

### Mandatory for GitHub release governance

- [ ] Independent GitHub username/team for security, identity and payments review.
- [ ] Independent GitHub username/team for database and operations review.
- [ ] Independent GitHub username/team for admin, content and accessibility review.
- [ ] Approval to configure required reviews, protected environments and production approvers.

### Required before JazzCash staging

- [ ] Current merchant-specific sandbox integration pack.
- [ ] Sandbox merchant/project identifier.
- [ ] Sandbox payment, callback/IPN, status, refund/reversal and reconciliation endpoints.
- [ ] Field rules, secure-hash/signing rules and response-code mapping.
- [ ] Sandbox credentials through a protected channel.
- [ ] Callback URLs and network/IP restrictions.
- [ ] Finance/reconciliation owner and settlement report format.

### Required before live AI staging

- [ ] DeepSeek project/account identifier.
- [ ] API key through a protected channel.
- [ ] Approved model and enabled task list.
- [ ] Per-job, daily and monthly budgets.
- [ ] Privacy/data-processing approval and prohibited input categories.
- [ ] Fallback/provider-outage decision.
- [ ] Usage/cost owner.

### Required before production

- [ ] Production Railway/AWS project and approvers.
- [ ] Production domain, DNS and TLS owner.
- [ ] Production SMTP credentials separate from staging.
- [ ] JazzCash production credentials separate from sandbox.
- [ ] Production monitoring/alerts and on-call ownership.
- [ ] Legal approval for terms, privacy, refund/cancellation, AI disclosure and support copy.
- [ ] Controlled first production OTP, payment/settlement and AI-operation approvals.

## 4. Internal actions that can proceed without provider credentials

- Deploy web/API/PostgreSQL with email, JazzCash and AI disabled.
- Verify release identity, migrations, public pages, PWA, cache/index boundaries and health.
- Enable SMTP when supplied and test the full account lifecycle.
- Enable premium capability testing with authorized synthetic/admin entitlements while JazzCash remains disabled.
- Configure the AI-worker service and encrypted volume, but do not enable live provider execution without approval.
- Configure monitoring projects and dashboards after account access is supplied.
- Execute all non-provider staging journeys in the staging runbook.

## 5. Staging execution order

1. Confirm provider and owners.
2. Create staging PostgreSQL, API and web services.
3. Generate protected staging secrets.
4. Deploy one exact reviewed `main` commit.
5. Verify migrations, readiness, release identity and automated live smoke.
6. Configure SMTP and complete account/privacy acceptance.
7. Complete all five learning paths and admin/analytics acceptance.
8. Enable premium capability staging tests.
9. Add and evaluate the AI worker when approved.
10. Enable JazzCash sandbox and execute the full payment matrix.
11. Execute accessibility, device/browser, network, security, abuse, performance and load testing.
12. Demonstrate database restore and artifact rollback.
13. Produce the immutable staging acceptance bundle.
14. Promote the same approved artifacts to production only after explicit approval.

## 6. Pre-deployment blockers

The following are not code defects and cannot be honestly marked complete without external evidence:

- provider/project access;
- protected secrets;
- domain/DNS ownership;
- independent reviewers and environment approvers;
- live SMTP/JazzCash/DeepSeek acceptance;
- deployed monitoring and alert delivery;
- real browser/device/accessibility/load evidence;
- live backup restore and artifact rollback;
- legal and operational owner approval.

## 7. Completion rule

Pre-deployment closure is achieved when:

- current documentation and issue trackers reflect PR #88;
- no open internal implementation PR remains;
- repository and deployment contracts pass CI;
- legacy repositories are explicitly non-authoritative;
- issue #87 contains the accountable owners/access status;
- only deployment/provider/human-acceptance items remain open.
