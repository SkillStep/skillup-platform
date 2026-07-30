# ADR 0001: Build SkillUp in a New Production Repository

- Status: Accepted
- Date: 2026-07-30

## Context

The existing QRK repositories contain legacy and partially migrated implementations with unresolved branch lineage, security, configuration, testing, deployment, and product-fit concerns. The product direction has also changed to SkillUp: a Pakistan-first, mobile-first web/PWA learning game with foundational SEO, AEO, and GEO requirements.

Promoting an inherited repository as the new product authority would mix recovery/remediation work with a new architecture and could silently retain unsuitable assumptions.

## Decision

`SkillStep/skillup-platform` is the new production source of truth for SkillUp.

The platform will be designed and implemented from scratch against the approved product specification and target architecture. Legacy QRK repositories may be reviewed as reference material or sources of individually approved components only.

A legacy component may be reused only after a dedicated review confirms:

- ownership and licensing;
- absence or remediation of secrets and private data;
- dependency and vulnerability status;
- functional and product relevance;
- architecture and contract compatibility;
- tests, migration, and rollback.

No automated mirror may push legacy branch changes into this repository.

## Consequences

Positive:

- clear product and source authority;
- clean security and delivery baseline;
- discoverability and mobile performance designed into the data and rendering model;
- reduced accidental inheritance of obsolete configuration and deployment patterns;
- controlled reuse rather than wholesale migration.

Cost:

- useful legacy behavior must be rediscovered, specified, tested, and selectively reimplemented;
- initial foundation work precedes visible feature velocity;
- legacy production parity, if any is required, must be explicitly inventoried.

## Guardrails

- New implementation issues must link to the SkillUp product specification.
- Copying substantial legacy code requires a separate review issue and pull request.
- Legacy repositories remain historical/research sources and do not define production behavior.
- `main` in this repository becomes canonical only through required review and checks as the engineering foundation is established.