# Release and Rollback

## Release candidate

A release is identified by one Git commit SHA and immutable web/API image identifiers. Rebuilding after approval creates a new candidate.

Before approval:

1. confirm CI and production-container smoke pass for the candidate;
2. review migration compatibility and backup status;
3. confirm web/API release identity matches;
4. review open P0/P1 defects and accepted-risk records;
5. confirm alert, support and incident owners are available;
6. preserve the generated release-evidence artifact.

## Promotion

Run checked-in migrations through the provider pre-deploy mechanism, gate traffic on readiness, then run the same live smoke used in CI. No direct server editing or unreviewed SQL is allowed.

## Rollback triggers

Rollback when readiness fails, critical journeys regress, release identity differs, error/latency thresholds breach, private data becomes cacheable, or a P0/P1 defect is confirmed.

## Application rollback

1. stop further promotion and record the decision;
2. select the previous known-good immutable web/API image pair;
3. verify database compatibility before changing application traffic;
4. restore the previous artifacts through the provider deployment mechanism;
5. run health, readiness, release identity and critical journey smoke;
6. monitor until stable and record the outcome.

Database rollback is not automatic. Prefer forward fixes. Any data restoration requires the backup/restore runbook and explicit human approval.
