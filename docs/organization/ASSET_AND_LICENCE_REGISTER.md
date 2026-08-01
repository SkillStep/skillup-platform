# Asset and Licence Register

Every legacy image, icon, font, audio, video, animation, 3D model, texture, design or content asset proposed for SkillUp must be reviewed here before use.

## Status values

- `unreviewed`
- `ownership-review`
- `security-review`
- `approved-retain`
- `approved-replace`
- `rejected`
- `migrated`

## Register

| ID | Source repo/branch/path | Asset type | Intended use | Creator/owner | Licence/evidence | Privacy/releases | Security scan | Performance review | Decision | Destination |
|---|---|---|---|---|---|---|---|---|---|---|
| ASSET-001 | `SkillStep/frontend` — exact source pending | UI images/icons/fonts | possible onboarding/profile UX | unknown | pending | pending | pending | pending | unreviewed | #70–#72 if approved |
| ASSET-002 | `SkillStep/mobile-app` — exact source pending | images/icons/fonts | possible learner/game UI | unknown | pending | pending | pending | pending | unreviewed | #70–#72 if approved |
| ASSET-003 | `SkillStep/mobile-app` — exact source pending | audio/video/animation | possible lessons, feedback or sharing | unknown | pending | pending | pending | pending | unreviewed | approved object storage only |
| ASSET-004 | `SkillStep/mobile-app` — exact source pending | 3D models/textures | possible game experience | unknown | pending | pending | pending | pending | unreviewed | only if product/performance approval exists |
| ASSET-005 | `SkillStep/python` object/generated outputs | generated media | historical AI output reference | unknown | pending | high privacy/provenance risk | pending | pending | unreviewed | default reject unless independently recreated |
| ASSET-006 | `SkillStep/web-admin` Ranchers assets | unrelated branded assets | none | external/Ranchers owner | not SkillStep launch material | possible third-party data | pending | not applicable | rejected | none |

## Required evidence

For each asset:

- exact repository, branch, commit and path;
- original creator and current rights holder;
- commercial-use licence and geographic/medium limitations;
- attribution requirement;
- third-party trademark or brand restrictions;
- model/property/privacy release where relevant;
- source-file authenticity and checksum;
- malware/file-integrity scan;
- duplicate and obsolete status;
- accessibility alternatives and captions/transcripts where needed;
- web/mobile performance impact;
- approved canonical storage location;
- retain, replace or reject decision;
- reviewer and approval date.

## Rules

- Unknown ownership means the asset cannot ship.
- Ranchers or unrelated branded assets cannot migrate into SkillUp.
- Generated media requires provenance, provider terms and human review.
- Personal images, voices or videos require valid consent/release evidence.
- Fonts require embedding and commercial-use rights.
- Large binaries and 3D assets should live in approved object/artifact storage, not active Git history, unless explicitly justified.
- Every shipped visual or media asset must meet accessibility and performance requirements.

## Migration procedure

1. Record the exact source and checksum.
2. Verify ownership and licence.
3. Scan and inspect the file.
4. Review privacy, accessibility and performance.
5. Approve retain, replace or reject.
6. Store approved files in the canonical controlled location.
7. Link the implementation PR and release evidence.
8. Preserve required attribution records.

## Release gate

No unreviewed legacy asset may appear in staging or production. Every shipped legacy-derived asset must be `approved-retain` or `migrated` with complete evidence.
