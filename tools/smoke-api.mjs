import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const port = 3101;
const diagnosticsPath = "artifacts/api-smoke-diagnostics.txt";
const child = spawn(process.execPath, ["apps/api/dist/index.js"], {
  env: {
    ...process.env,
    API_HOST: "127.0.0.1",
    API_PORT: String(port),
    LOG_LEVEL: "silent",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
let spawnError = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});
child.on("error", (error) => {
  spawnError = error.stack ?? error.message;
});

function diagnosticText(error) {
  return [
    `error=${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    `exitCode=${String(child.exitCode)}`,
    `signalCode=${String(child.signalCode)}`,
    `spawnError=${spawnError}`,
    "--- stdout ---",
    stdout,
    "--- stderr ---",
    stderr,
  ].join("\n");
}

async function persistDiagnostics(error) {
  const text = diagnosticText(error);
  await mkdir("artifacts", { recursive: true });
  await writeFile(diagnosticsPath, `${text}\n`, "utf8");
  console.error(text);
}

async function stop() {
  if (child.exitCode === null) child.kill("SIGTERM");

  await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve())),
    delay(5_000).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }),
  ]);

  child.stdout.destroy();
  child.stderr.destroy();
}

try {
  let readyResponse;

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    if (child.exitCode !== null || spawnError) {
      throw new Error("SkillUp API exited before readiness.");
    }

    try {
      readyResponse = await fetch(`http://127.0.0.1:${port}/v1/ready`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (readyResponse.ok) break;
    } catch {
      // The server may still be starting.
    }

    await delay(500);
  }

  if (!readyResponse?.ok) {
    throw new Error("SkillUp API did not become ready.");
  }

  const ready = await readyResponse.json();
  const healthResponse = await fetch(`http://127.0.0.1:${port}/v1/health`, {
    signal: AbortSignal.timeout(1_000),
  });
  const health = await healthResponse.json();

  if (ready.status !== "ok" || health.status !== "ok") {
    throw new Error(`Unexpected API health payload: ${JSON.stringify({ ready, health })}`);
  }

  console.log("SkillUp API/PostgreSQL startup smoke passed.");
} catch (error) {
  await persistDiagnostics(error);
  throw error;
} finally {
  await stop();
}
