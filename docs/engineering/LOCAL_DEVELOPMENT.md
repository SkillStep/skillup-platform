# Local Development Bootstrap

## Supported foundation versions

- Node.js 24.18.x LTS
- pnpm 11.17.x through Corepack
- Python 3.13.14
- PostgreSQL 18.4 through Docker Compose
- Docker Engine with Compose v2

The executable Next.js and Fastify packages are the next step under issue #15. The current bootstrap validates repository structure, configuration hygiene, runtime pins and the Python worker package boundary.

## 1. Clone and prepare

```bash
git clone https://github.com/SkillStep/skillup-platform.git
cd skillup-platform
corepack enable
corepack prepare pnpm@11.17.0 --activate
pnpm install --frozen-lockfile
```

## 2. Local environment

```bash
cp .env.example .env
```

Replace placeholder secrets with local-only random values. Never commit `.env`.

## 3. Start PostgreSQL

```bash
pnpm infra:up
docker compose -f infra/compose.yaml ps
```

Stop or reset:

```bash
pnpm infra:down
pnpm infra:reset
```

`infra:reset` deletes the local PostgreSQL volume. It must never be run against staging or production.

## 4. Validate foundation

```bash
pnpm check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Until the executable application packages land, these commands explicitly validate the foundation only and print a notice. A future pull request must replace the bootstrap behavior with real package-specific checks before feature implementation is accepted.

## 5. AI worker health

Without installing third-party dependencies:

```bash
PYTHONPATH=services/ai-worker/src \
  python -m skillup_ai_worker.health
```

Expected local output includes a disabled provider and no secrets.

## 6. Required application commands after scaffold completion

The completed monorepo must provide:

```bash
pnpm dev
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Application-specific READMEs must document database migration, seed, API contract, end-to-end test and production-start commands.

## 7. Troubleshooting

### Wrong Node or pnpm version

Use `.node-version` and the pinned `packageManager`. Do not regenerate the lockfile with another pnpm major version.

### Port 5432 already in use

Stop the existing local PostgreSQL service or change only the host-side development port and matching local `DATABASE_URL`.

### Environment validation fails

Do not weaken required-variable checks. Supply a local placeholder or keep the integration explicitly disabled.

### A secret is accidentally committed

Do not merely delete the current file. Revoke/rotate the value, preserve incident evidence privately, remove it from the current tree and follow the security process.

## 8. Data policy

- Use synthetic learner, payment and content fixtures.
- Do not copy production databases into local or preview environments.
- Do not use real JazzCash credentials outside protected environments.
- Do not send private learner content to an AI provider during local testing.
- Generated test output remains untracked.