# ADR 0002 — Monorepo and Runtime Toolchain

- **Status:** Accepted for MVP foundation
- **Date:** 2026-07-30
- **Owners:** SkillUp engineering
- **Related:** #15, #16

## Context

SkillUp needs a mobile-first web application, a server-authoritative API, shared contracts and UI, and a Python AI worker. The codebase must remain understandable to a lean team and autonomous development agents while supporting weekly releases.

## Decision

Use one GitHub monorepo with:

- Node.js **24 LTS** as the JavaScript/TypeScript runtime;
- pnpm **11.17.x**, pinned through the root `packageManager` field and Corepack;
- TypeScript for web, API and shared packages;
- Next.js **16.2.x Active LTS** for the public web/PWA;
- Python **3.13.x** for the AI worker;
- PostgreSQL **18.x** for local and production-compatible development;
- containerized local dependencies through Docker Compose;
- one root command surface for install, development, validation and build.

Repository shape:

```text
apps/web
apps/api
services/ai-worker
packages/ui
packages/contracts
packages/content-schema
packages/discoverability
packages/analytics
infra
content
docs
```

Dependencies are declared by package. Shared packages cannot import from applications. Applications may import approved shared packages only through public package exports.

## Requirements

- Runs on Windows, macOS and Linux.
- Supports a clean checkout and deterministic dependency installation.
- Public rendering supports server components, static generation and streaming where appropriate.
- Python work remains isolated from browser and API dependency graphs.
- Package boundaries are enforceable through lint/import rules and project references.
- Runtime upgrades are deliberate and tested, not implicit.

## Alternatives considered

### Multiple repositories

Rejected for MVP because it increases contract drift, release coordination and AI/human orientation cost. It may be reconsidered if independent ownership, access control or scaling demands outweigh the coordination cost.

### JavaScript-only stack

Rejected because Python remains useful for model evaluation, content-quality tooling and future media/ML tasks. Routine API logic must not be moved to Python without a clear reason.

### Python-only backend and web

Rejected because the primary product surface is a modern React/Next.js web application and the team benefits from shared TypeScript contracts.

### npm or Yarn workspaces

Not selected. pnpm's strict dependency model and workspace performance are better suited to preventing accidental undeclared imports in this repository.

### Node.js Current release

Rejected for production. The project uses an LTS runtime to reduce upgrade and support risk.

## Cost implications

The monorepo and selected tools are open source. Main costs are CI minutes, dependency maintenance and contributor onboarding. Shared CI caching should reduce repeated installation cost.

## Security implications

- Corepack and package-manager version are pinned.
- Lockfiles are mandatory and reviewed.
- Third-party actions and container images are pinned by immutable version or digest.
- No runtime `.env` file is copied into images.
- Browser bundles receive only explicitly public variables.
- Python and Node dependency scanning run separately.

## Operational burden

The repository must maintain two language toolchains. Root documentation and CI must make the boundary explicit. An AI worker change cannot silently bypass API contracts or publication controls.

## Migration path

The legacy QRK repositories are reference-only. Reuse occurs through scoped migration issues after security, license, dependency and product-fit review. No git-history merge is required.

## Rollback and revisit triggers

Revisit this ADR if:

- one component requires materially different access control or release cadence;
- monorepo CI time becomes a persistent delivery blocker;
- Python is no longer justified by production tasks;
- Next.js cannot meet the agreed deployment portability or performance requirements;
- a runtime reaches maintenance/EOL and supported dependencies require migration.

Rollback means returning to the previous known-good toolchain versions through a reviewed lockfile and container update. It never means restoring an EOL runtime or unpinned dependency state.