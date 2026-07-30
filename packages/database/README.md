# SkillUp Database Package

This package owns the versioned PostgreSQL schema, SQL migrations, deterministic local seed data and database health helpers.

## Commands

From the repository root:

```bash
pnpm db:generate
pnpm db:wait
pnpm db:migrate
pnpm db:seed
pnpm db:smoke
```

For a first local setup:

```bash
cp .env.example .env
pnpm local:setup
```

`local:setup` starts PostgreSQL, waits for readiness, applies checked-in migrations, inserts the synthetic launch catalog idempotently and verifies the expected records.

## Migration policy

- `src/schema.ts` is the codebase schema source of truth.
- Drizzle Kit generates reviewed SQL under `drizzle/`.
- Generated SQL and snapshot metadata are committed.
- Production uses migrations, never `drizzle-kit push`.
- Destructive or locking changes require a rollout, backup and rollback plan.
- Data changes use a separate idempotent migration or approved operational job.
- A migration is applied once under the deployment lock before incompatible application behavior is enabled.

## Seed policy

The seed contains only fixed synthetic catalog records. It contains no production accounts, learner attempts, payment information, credentials or private source content.

The published seed is deliberately limited to the reviewed `Interview and Workplace Communication` pilot. The other four launch skills remain draft records.

## Ownership boundaries

- This package contains schema and persistence adapters, not HTTP or UI behavior.
- The browser must never import this package.
- API and worker services receive only the database permissions they require.
- Learner progress, rewards, payments and entitlements will use transactional and append-only designs in focused migrations.
- Content versions are immutable references once used by a learner attempt.

## Recovery

Local data can be reset with:

```bash
pnpm infra:reset
pnpm local:setup
```

That command is destructive and is for local development only. Staging and production restoration follows the backup and incident runbooks.