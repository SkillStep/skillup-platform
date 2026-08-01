# Repository Inventory

Last audited: 2026-08-01

## Organization summary

The SkillStep organization contains six private repositories. `skillup-platform` is the canonical active product. The remaining five are legacy QRK or unrelated codebases and are under security hold.

| Repository | Classification | Default branch | Substantive branches observed | Primary risks | Required disposition |
|---|---|---|---|---|---|
| `SkillStep/skillup-platform` | Canonical active product | `main` | feature/release branches through reviewed PRs | incomplete product work, external-provider and production gates | retain; complete through #69–#78 |
| `SkillStep/python` | Legacy AI/game-generation service | `main` | `staging` and other historical branches | unauthenticated AI endpoints, wildcard credentialed CORS, unbounded retries, arbitrary URL fetching, provider/cloud secrets, no reliable tests | quarantine; approved concepts only; archive |
| `SkillStep/frontend` | Legacy React Native QRK client | `main` | `dev`, `master` | overlap with `mobile-app`, signing/Firebase/test-token risk, two lockfiles, weak tests, misleading naming | quarantine; review unique UX/assets; archive |
| `SkillStep/web-admin` | Unrelated Ranchers Cafe/QRK admin | `main` | `master` | ownership mismatch, deploy-token history, committed environment/endpoints, unsafe CI/SSH, unrelated GraphQL business modules | immediate security hold; transfer or archive |
| `SkillStep/backend` | Legacy Express/Mongoose/MongoDB service | `main` | `master`, `staging-new`, historical QA/test/release branches | fragmented history, old dependencies, no meaningful tests, provider/database credentials, possible live data/endpoints | quarantine; migrate approved contracts/data; decommission and archive |
| `SkillStep/mobile-app` | Large legacy QRK React Native app and asset archive | `main` | `dev`, historical release/QA/test branches | signing keystores, Firebase/push/IAP/store ownership, large binary/3D assets, unclear licences, legacy service dependencies | quarantine; resolve stores/signing/assets; archive |

## Canonical product record

### `SkillStep/skillup-platform`

- **Purpose:** Pakistan-first, mobile-first SkillUp web/PWA, API, PostgreSQL data model and controlled AI worker.
- **Approved stack:** Next.js/PWA, Fastify, PostgreSQL and provider-agnostic Python AI worker.
- **Deployment authority:** sole approved staging and production source.
- **Program issues:** #11, #69–#78.
- **Organization controls:** #80–#85.
- **Current external inputs:** JazzCash merchant contracts/credentials, OTP email-provider credentials and DeepSeek key/model/budgets.
- **Required owners:** product, security/payments, database/operations, infrastructure/release, AI, admin/content, accessibility/discoverability.

## Legacy repository records

### `SkillStep/python`

- **Business purpose:** historical QRK AI and game generation.
- **Runtime:** mixed Flask/FastAPI; historical container targets FastAPI.
- **Data/providers:** AI providers and S3-style object storage require verification.
- **Deployment status:** unknown externally; must be verified under #82.
- **Disposition issue:** `SkillStep/python#1`.
- **Migration candidates:** prompt/task structures, moderation and validation concepts only after #84 review.

### `SkillStep/frontend`

- **Business purpose:** historical QRK React Native client prototype.
- **Runtime:** React Native 0.72-era application on non-default branches.
- **Data/providers:** Firebase, external endpoints, signing/test configuration require verification.
- **Overlap:** materially overlaps `SkillStep/mobile-app`.
- **Disposition issue:** `SkillStep/frontend#1`.
- **Migration candidates:** unique UX and owned/licensed assets only.

### `SkillStep/web-admin`

- **Business purpose:** appears to be Ranchers Cafe/QRK administration, not SkillUp.
- **Runtime:** React/Apollo/GraphQL with legacy deployment configuration.
- **Ownership:** unresolved; requires business/legal determination.
- **Data/providers:** Ranchers endpoints, Mapbox and deployment infrastructure require containment.
- **Disposition issue:** `SkillStep/web-admin#1`.
- **Migration candidates:** none by default; generic workflows only if independently required by SkillUp.

### `SkillStep/backend`

- **Business purpose:** historical QRK API and data service.
- **Runtime:** Express, Mongoose and MongoDB on divergent branches.
- **Providers:** Twilio/SMS, SMTP, Google APIs and other integrations require verification.
- **Data:** MongoDB clusters/collections, backups and retention are unknown externally.
- **Disposition issue:** `SkillStep/backend#1`.
- **Migration candidates:** approved business contracts/data only through explicit field mapping and reconciliation.

### `SkillStep/mobile-app`

- **Business purpose:** historical QRK native application.
- **Runtime:** React Native with 3D, media, social, subscription, push and IAP capabilities.
- **Providers/accounts:** Firebase, OneSignal/FCM/APNs, Google Play, App Store Connect and IAP ownership require verification.
- **Assets:** large collection of images, fonts, audio/video and 3D models requires provenance/licence/security review.
- **Disposition issue:** `SkillStep/mobile-app#1`.
- **Migration candidates:** approved UX or assets only; native launch remains deferred.

## Unknowns requiring external verification

- Current organization members, teams and repository collaborators.
- GitHub/GitLab deploy keys, tokens, runners and environment permissions.
- Live Railway, Vercel, Netlify, Firebase, AWS or other cloud services.
- DNS records and certificates.
- Provider callbacks, schedulers and webhooks.
- Databases, backups, buckets, queues and active user dependencies.
- Google Play/App Store ownership and release status.
- Credential validity and rotation status.

Every unknown must receive an accountable owner and final disposition in the linked registers before #85 can close.
