# Local Development Bootstrap

## Supported versions

- Node.js 24.18.x LTS
- pnpm 11.17.x through Corepack
- Python 3.13.14
- PostgreSQL 18.4 through Docker Compose
- Docker Engine with Compose v2

The repository contains executable Next.js, Fastify, shared TypeScript packages, a Python AI-worker bootstrap and a versioned PostgreSQL catalog schema.

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

Replace placeholder secrets with local-only random values. Keep the local PostgreSQL password and `DATABASE_URL` consistent. Never commit `.env`.

## 3. Prepare PostgreSQL and seed content

```bash
pnpm local:setup
```

This command:

1. starts PostgreSQL;
2. waits up to 30 seconds for readiness;
3. applies checked-in SQL migrations;
4. inserts the deterministic synthetic launch catalog idempotently;
5. verifies five skills, five paths and exactly one published pilot.

Individual commands are available when troubleshooting:

```bash
pnpm infra:up
pnpm db:wait
pnpm db:migrate
pnpm db:seed
pnpm db:smoke
```

Stop or reset:

```bash
pnpm infra:down
pnpm infra:reset
```

`infra:reset` deletes the local PostgreSQL volume. It must never be run against staging or production.

## 4. Run the applications

```bash
pnpm dev
```

Default local addresses:

- Web: `http://127.0.0.1:3000/en`
- API health: `http://127.0.0.1:3001/v1/health`
- API readiness: `http://127.0.0.1:3001/v1/ready`

The API fails configuration validation when `DATABASE_URL` is missing or does not use PostgreSQL. Readiness returns `503` when the database cannot be reached.

## 5. Validate the repository

```bash
pnpm check
pnpm smoke:api
```

`pnpm check` performs:

- repository and secret-pattern validation;
- workspace dependency-boundary checks;
- formatting and linting;
- strict TypeScript checks;
- TypeScript and Python tests;
- production web, API and shared-package builds.

`pnpm smoke:api` starts the built API on a temporary local port and verifies database-backed readiness and liveness. PostgreSQL must already be running and migrated.

Individual checks:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 6. AI worker health

```bash
PYTHONPATH=services/ai-worker/src \
  python -m skillup_ai_worker.health
```

Expected local output includes a disabled provider and no secrets. Live model calls remain disabled until the gateway, cost, schema and review controls are implemented.

## 7. Migration workflow

After an approved schema change:

```bash
pnpm db:generate
```

Review the generated SQL and Drizzle snapshot. Commit both. Production uses checked-in migrations; do not use schema push as a deployment shortcut.

## 8. Troubleshooting

### Wrong Node or pnpm version

Use `.node-version` and the pinned `packageManager`. Do not regenerate the lockfile with another pnpm major version.

### Port 5432 already in use

Stop the existing local PostgreSQL service or change only the host-side development port and matching local `DATABASE_URL`.

### Database readiness fails

Run `docker compose -f infra/compose.yaml ps` and `pnpm db:wait`. Confirm that the username, password, database and host match `.env`.

### Environment validation fails

Do not weaken required-variable checks. Supply a local placeholder or keep an integration explicitly disabled.

### A secret is accidentally committed

Do not merely delete the current file. Revoke or rotate the value, preserve incident evidence privately, remove it from the current tree and follow the security process.

## 9. Data policy

- Use synthetic learner, payment and content fixtures.
- Do not copy production databases into local or preview environments.
- Do not use real JazzCash credentials outside protected environments.
- Do not send private learner content to an AI provider during local testing.
- Generated test output remains untracked.