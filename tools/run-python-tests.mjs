import { spawnSync } from "node:child_process";
import { delimiter, join } from "node:path";
import process from "node:process";

const workerSource = join(process.cwd(), "services", "ai-worker", "src");
const environment = {
  ...process.env,
  AI_PROVIDER: "disabled",
  AI_FALLBACK_PROVIDER: "disabled",
  FEATURE_AI_GENERATION_ENABLED: "false",
  PYTHONPATH: [workerSource, process.env.PYTHONPATH].filter(Boolean).join(delimiter),
  RELEASE_SHA: process.env.RELEASE_SHA ?? "local",
};

const candidates =
  process.platform === "win32" ? [["py", "-3.13"], ["python"]] : [["python3"], ["python"]];

function findPython() {
  for (const [command, ...prefix] of candidates) {
    const result = spawnSync(command, [...prefix, "--version"], {
      encoding: "utf8",
      env: environment,
    });
    if (result.status === 0) return { command, prefix };
  }

  throw new Error("Python 3.13 is required but no supported Python command was found.");
}

function run(command, args) {
  const result = spawnSync(command, args, {
    env: environment,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const { command, prefix } = findPython();
run(command, [
  ...prefix,
  "-m",
  "compileall",
  "-q",
  "services/ai-worker/src",
  "services/ai-worker/tests",
]);
run(command, [...prefix, "-W", "error::ResourceWarning", "-m", "unittest", "discover", "-s", "services/ai-worker/tests", "-v"]);
run(command, [...prefix, "-m", "skillup_ai_worker.evaluate"]);
run(command, [...prefix, "-m", "skillup_ai_worker.health"]);
