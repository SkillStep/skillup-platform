import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function requirePostgresUrl(name) {
  const raw = process.env[name]?.trim();
  if (!raw) throw new Error(`${name} is required.`);
  const url = new URL(raw);
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) {
    throw new Error(`${name} must use PostgreSQL.`);
  }
  if (!url.hostname || !url.pathname.slice(1)) {
    throw new Error(`${name} must identify a host and database.`);
  }
  return url;
}

function databaseIdentity(url) {
  return `${url.hostname.toLowerCase()}:${url.port || "5432"}/${url.pathname.slice(1)}`;
}

function postgresEnvironment(url) {
  const sslMode = url.searchParams.get("sslmode");
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    ...(sslMode ? { PGSSLMODE: sslMode } : {}),
  };
}

function run(command, args, environment, label) {
  const result = spawnSync(command, args, {
    cwd: new URL("..", import.meta.url),
    env: environment,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw new Error(`${label} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = `${result.stderr || result.stdout || "unknown failure"}`
      .replaceAll(environment.PGPASSWORD ?? "", "[redacted]")
      .slice(0, 4000);
    throw new Error(`${label} failed: ${detail}`);
  }
}

const source = requirePostgresUrl("SOURCE_DATABASE_URL");
const restore = requirePostgresUrl("RESTORE_DATABASE_URL");
if (databaseIdentity(source) === databaseIdentity(restore)) {
  throw new Error("The restore target must not be the source database.");
}
if (process.env["ALLOW_DESTRUCTIVE_RESTORE_TARGET"] !== "true") {
  throw new Error(
    "Set ALLOW_DESTRUCTIVE_RESTORE_TARGET=true only after confirming the restore target is isolated and disposable.",
  );
}
if (!/(restore|recovery|dr|test|staging)/i.test(restore.pathname.slice(1))) {
  throw new Error(
    "The restore target database name must visibly indicate restore, recovery, DR, test or staging use.",
  );
}

const directory = mkdtempSync(join(tmpdir(), "skillup-restore-"));
const archive = join(directory, "skillup.backup");
try {
  console.log("Creating encrypted-transport-compatible PostgreSQL backup artifact…");
  run(
    "pg_dump",
    ["--format=custom", "--no-owner", "--no-privileges", "--file", archive],
    postgresEnvironment(source),
    "PostgreSQL backup",
  );

  console.log("Restoring into the isolated verification target…");
  run(
    "pg_restore",
    [
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-privileges",
      "--dbname",
      restore.pathname.slice(1),
      archive,
    ],
    postgresEnvironment(restore),
    "PostgreSQL restore",
  );

  console.log("Applying forward-compatible migrations and running critical database smokes…");
  const restoreEnvironment = { ...process.env, DATABASE_URL: restore.toString() };
  run("pnpm", ["db:migrate"], restoreEnvironment, "Migration verification");
  run("pnpm", ["db:smoke"], restoreEnvironment, "Restored database smoke verification");

  console.log("SkillUp backup and isolated restore verification passed.");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
