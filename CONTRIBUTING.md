# Contributing to SkillUp

## Workflow

1. Start from an approved GitHub issue.
2. Branch from the current canonical `main`.
3. Keep the change focused and independently reviewable.
4. Add or update tests and documentation with the implementation.
5. Open a pull request using the repository template.
6. Resolve review findings and required checks without bypassing them.
7. Merge only after acceptance criteria and rollout/rollback evidence are complete.

## Branch naming

Use a concise category and issue-oriented description:

- `feat/123-learning-path`
- `fix/234-payment-reconciliation`
- `docs/345-content-governance`
- `chore/456-ci-baseline`
- `security/567-session-rotation`

## Commit guidance

Prefer clear conventional-style messages:

- `feat: add level progress ledger`
- `fix: reject duplicate JazzCash callbacks`
- `docs: define Urdu content workflow`
- `test: cover cross-user progress access`

Do not place secrets, personal data, payment payloads, or private incident details in commit messages.

## Issue requirements

An implementation issue must include:

- business and learner outcome;
- affected application/package/domain;
- in-scope and out-of-scope boundaries;
- acceptance criteria;
- validation commands and test cases;
- security, privacy, accessibility, and performance requirements;
- SEO/AEO/GEO requirements for public pages/content;
- analytics events and success measures;
- dependencies, rollout, monitoring, and rollback;
- AI execution boundary where an autonomous agent may contribute.

## Pull request size

Prefer the smallest change that delivers a verifiable outcome. Separate:

- behavior from mass formatting;
- dependency upgrades from feature work;
- architecture changes from content migration;
- payment integration from unrelated UI work;
- public content generation from publication;
- security remediation from broad modernization.

## Validation

Run the package-specific commands documented in each application/package. The target repository checks include:

- formatting and lint;
- type checks;
- unit, integration, contract, and end-to-end tests;
- accessibility and discoverability checks;
- dependency, secret, static, and container security scans;
- production build and startup/health tests.

State the exact observed results. Do not claim unobserved validation.

## Documentation and decisions

- Update product and architecture docs when behavior or contracts change.
- Use an ADR for material decisions affecting architecture, security, data, payment, AI provider strategy, localization, or public URL behavior.
- Preserve migration and rollback instructions for schema, contract, content, and deployment changes.

## Review priorities

Reviewers should examine, in order:

1. security, privacy, payment, authorization, and data integrity;
2. correctness of learning, scoring, progress, and content version behavior;
3. accessibility, mobile performance, and discoverability;
4. tests, observability, rollout, and rollback;
5. maintainability and clarity.

## Legacy code

The QRK repositories are not production authority. Reuse requires a dedicated issue and evidence for:

- ownership and license;
- secret and private-data review;
- dependency and vulnerability review;
- functional relevance;
- architecture compatibility;
- tests and migration plan.

Do not copy legacy code directly into `main` without this review.