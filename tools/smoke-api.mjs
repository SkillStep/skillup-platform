import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import process from "node:process";

const port = 3101;
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const child = spawn(command, ["--filter", "@skillup/api", "start"], {
  env: {
    ...process.env,
    API_HOST: "127.0.0.1",
    API_PORT: String(port),
    LOG_LEVEL: "silent",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

async function stop(): Promise<void> {
  if (child.exitCode === null) child.kill("SIGTERM");

  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    delay(5_000).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }),
  ]);
}

try {
  let readyResponse;

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`SkillUp API exited before readiness.\n${output}`);
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
    throw new Error(`SkillUp API did not become ready.\n${output}`);
  }

  const ready = await readyResponse.json();
  const healthResponse = await fetch(`http://127.0.0.1:${port}/v1/health`);
  const health = await healthResponse.json();

  if (ready.status !== "ok" || health.status !== "ok") {
    throw new Error(`Unexpected API health payload: ${JSON.stringify({ ready, health })}`);
  }

  console.log("SkillUp API/PostgreSQL startup smoke passed.");
} finally {
  await stop();
}
