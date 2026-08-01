# Legacy Migration Register

No legacy code, data, content, prompt, design or asset may enter `SkillStep/skillup-platform` without an approved entry in this register.

## Status values

- `proposed`
- `under-review`
- `approved-rewrite`
- `approved-direct-use`
- `rejected`
- `implemented`
- `verified`

Direct use is exceptional. Authentication, authorization, payments, provider clients, secret handling, network clients, database access and deployment code are never eligible for direct use.

## Required fields

| ID | Status | Source repo | Branch/commit/path | Item | Current SkillUp requirement | Destination issue | Ownership/licence | Security/privacy | Decision | Tests/evidence | Reviewer |
|---|---|---|---|---|---|---|---|---|---|---|---|
| MIG-001 | proposed | `SkillStep/python` | to be recorded | game-generation prompt/task concepts | AI-assisted reviewed challenge generation | #73 | unknown; verify | rewrite only; no secret/log/provider reuse | pending | pending | pending |
| MIG-002 | proposed | `SkillStep/python` | to be recorded | moderation/validation concepts | deterministic AI output validation | #73 | unknown; verify | rewrite only; evaluation evidence required | pending | pending | pending |
| MIG-003 | proposed | `SkillStep/frontend` | to be recorded | unique onboarding/profile/avatar UX | learner onboarding and profile completion | #70/#71 | verify asset/design ownership | reimplement in accessible PWA | pending | pending | pending |
| MIG-004 | proposed | `SkillStep/mobile-app` | to be recorded | unique gameplay/share/achievement UX | full learner game journey and sharing | #70/#72 | verify design and asset ownership | reimplement; no provider/signing code | pending | pending | pending |
| MIG-005 | proposed | `SkillStep/mobile-app` | to be recorded | selected image/font/audio/video/3D assets | approved learner experience | #70/#72 | full provenance/licence required | malware, privacy and performance review required | pending | pending | pending |
| MIG-006 | proposed | `SkillStep/backend` | to be recorded | approved legacy API/business contracts | residual launch requirements not represented in canonical specs | #70–#76 | business ownership required | field-level data/privacy mapping required | pending | pending | pending |
| MIG-007 | proposed | `SkillStep/backend` | datastore record required | approved legacy learner/content data | migration only if active business need is confirmed | relevant issue | data ownership/retention approval required | encrypted migration, reconciliation and rollback required | pending | pending | pending |
| MIG-008 | rejected | `SkillStep/web-admin` | all Ranchers-specific source | none | none | belongs to external/unrelated product | do not migrate into SkillUp | rejected | organization audit #80 | product/security |

## Review procedure

1. Record the exact source repository, branch, commit and path.
2. Confirm the item supports an approved current requirement.
3. Confirm ownership, commercial licence and attribution.
4. Classify personal, payment, authentication or confidential data.
5. Review security, privacy, accessibility and performance implications.
6. Choose `rewrite`, exceptional `direct-use`, or `reject`.
7. Link a bounded canonical implementation issue and PR.
8. Define tests and acceptance evidence.
9. Obtain product, technical and relevant specialist approval.
10. Mark `verified` only after the canonical implementation passes CI and acceptance.

## Prohibited migrations

- Legacy authentication, authorization and session logic
- Legacy payment or subscription code
- Provider credentials, adapters or webhook verification
- Secret and environment handling
- Network/download clients
- Deployment and CI scripts
- MongoDB access code
- Ranchers-specific source or assets
- Production data copied into Git or unapproved fixtures
- Signing keys, mobile certificates or store credentials
- Generated prompt logs or personal/user content

## Rejected-item discipline

Rejected items remain listed with a concise rationale so they are not repeatedly reconsidered without new evidence or an explicit product-scope change.
