# Incident Response

## Severity

- **P0:** active security/privacy breach, destructive data corruption, or total outage affecting most users.
- **P1:** critical learner journey unavailable, widespread authentication failure, or incorrect rewards/data.
- **P2:** degraded feature with a safe workaround and limited impact.
- **P3:** minor defect or operational improvement.

## Response flow

1. Record detection time, reporter, release SHA, affected services and initial evidence.
2. Assign an incident commander and technical owner; restrict production changes to approved operators.
3. Contain first: disable the affected feature, revoke credentials, block abusive traffic, or restore the known-good artifact.
4. Preserve logs and audit evidence without copying secrets or unnecessary personal data.
5. Confirm impact for security, privacy, availability, data integrity, content quality and payments.
6. Communicate factual status, scope and next update through the approved channel.
7. Recover using the rollback or restore runbook; verify health, readiness, critical journeys and release identity.
8. Close only after monitoring remains stable and affected data is reconciled.

## Escalation

P0/P1 incidents require immediate human approval for credential rotation, data restoration, public communication, traffic changes and risk acceptance. Payment, privacy or security incidents also require the designated business/compliance owner.

## Post-incident

Within the approved review window, document timeline, root cause, contributing controls, user impact, detection gap, corrective actions, owners and due dates. Never delete or rewrite audit evidence to simplify the record.
