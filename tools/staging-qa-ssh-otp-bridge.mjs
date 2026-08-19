import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import http from "node:http";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4343;
const MAX_LOOKBACK_MS = 10 * 60_000;
const CLOCK_SKEW_MS = 10_000;
const REMOTE_CONFIRMATION = "I_UNDERSTAND_THIS_READS_STAGING_QA_OTP_EVIDENCE";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the staging QA SSH OTP bridge.`);
  return value;
}

function normalizeEmail(value) {
  return value.trim().toLocaleLowerCase("en-US");
}

function qaEmailAllowlist() {
  return new Set(
    Object.entries(process.env)
      .filter(([name, value]) => name.startsWith("STAGING_QA_") && name.endsWith("_EMAIL") && value)
      .map(([, value]) => normalizeEmail(value)),
  );
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function bearerToken(request) {
  const authorization = request.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1]?.trim() ?? "";
}

function parseAfter(value, now = Date.now()) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("after must be a valid ISO timestamp.");
  if (timestamp > now + CLOCK_SKEW_MS) throw new Error("after cannot be in the future.");
  if (timestamp < now - MAX_LOOKBACK_MS) throw new Error("after is outside the allowed QA lookup window.");
  return new Date(timestamp).toISOString();
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function runProcess(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} timed out.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

async function readOtpOverSsh(email, after) {
  const sshHost = required("STAGING_SSH_BRIDGE_HOST");
  const sshUser = required("STAGING_SSH_BRIDGE_USER");
  const keyFile = required("STAGING_SSH_KEY_FILE");
  const knownHostsFile = required("STAGING_SSH_KNOWN_HOSTS_FILE");

  const remoteCommand = [
    "cd /opt/skillup &&",
    "docker compose -f docker-compose.staging.yml exec -T",
    `-e STAGING_QA_OTP_READ_CONFIRM=${shellQuote(REMOTE_CONFIRMATION)}`,
    `-e STAGING_QA_OTP_EMAIL=${shellQuote(email)}`,
    `-e STAGING_QA_OTP_AFTER=${shellQuote(after)}`,
    "api node dist/cli/staging-qa-read-otp.js",
  ].join(" ");

  const result = await runProcess(
    "ssh",
    [
      "-i",
      keyFile,
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      "-o",
      `UserKnownHostsFile=${knownHostsFile}`,
      "-o",
      "StrictHostKeyChecking=yes",
      `${sshUser}@${sshHost}`,
      remoteCommand,
    ],
    20_000,
  );

  if (result.code === 4) return null;
  if (result.code !== 0) {
    const error = new Error(`Staging SSH OTP reader exited with status ${result.code}.`);
    Object.assign(error, { statusCode: 503 });
    throw error;
  }

  const line = result.stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .at(-1);
  if (!line) return null;

  let body;
  try {
    body = JSON.parse(line);
  } catch {
    const error = new Error("Staging SSH OTP reader returned invalid JSON.");
    Object.assign(error, { statusCode: 503 });
    throw error;
  }

  return typeof body?.code === "string" && /^\d{4}$/.test(body.code) ? body.code : null;
}

function sendJson(response, statusCode, body) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store, max-age=0",
    pragma: "no-cache",
  });
  response.end(payload);
}

function runSelfTest() {
  const now = Date.parse("2026-08-19T17:00:00.000Z");
  if (parseAfter("2026-08-19T16:59:58.000Z", now) !== "2026-08-19T16:59:58.000Z") {
    throw new Error("after parsing failed");
  }
  if (!constantTimeEqual("same-token", "same-token") || constantTimeEqual("same-token", "other-token")) {
    throw new Error("bearer token comparison failed");
  }
  if (shellQuote("safe'value") !== `'safe'"'"'value'`) throw new Error("shell quoting failed");
  console.log("STAGING QA SSH OTP BRIDGE SELF-TEST: PASS");
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

const bridgeToken = required("STAGING_QA_MAILBOX_TOKEN");
const host = process.env.STAGING_QA_MAILBOX_HOST?.trim() || DEFAULT_HOST;
const port = Number.parseInt(process.env.STAGING_QA_MAILBOX_PORT ?? String(DEFAULT_PORT), 10);
const allowedEmails = qaEmailAllowlist();

if (host !== DEFAULT_HOST) throw new Error("The staging QA SSH OTP bridge must bind to 127.0.0.1 only.");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid staging QA SSH OTP bridge port.");
if (allowedEmails.size === 0) throw new Error("No staging QA email aliases are configured for the SSH OTP bridge.");

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", `http://${host}:${port}`);

    if (request.method === "GET" && requestUrl.pathname === "/health") {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    if (request.method !== "GET" || requestUrl.pathname !== "/otp") {
      sendJson(response, 404, { error: "not_found" });
      return;
    }

    const presentedToken = bearerToken(request);
    if (!presentedToken || !constantTimeEqual(presentedToken, bridgeToken)) {
      sendJson(response, 401, { error: "unauthorized" });
      return;
    }

    const email = normalizeEmail(requestUrl.searchParams.get("email") ?? "");
    if (!allowedEmails.has(email)) {
      sendJson(response, 403, { error: "email_not_allowed" });
      return;
    }

    const after = parseAfter(requestUrl.searchParams.get("after") ?? "");
    const code = await readOtpOverSsh(email, after);
    if (!code) {
      sendJson(response, 404, { error: "otp_not_available_yet" });
      return;
    }

    sendJson(response, 200, { code });
  } catch (error) {
    const statusCode = error?.statusCode === 503 ? 503 : 400;
    sendJson(response, statusCode, {
      error: statusCode === 503 ? "staging_otp_reader_unavailable" : "invalid_request",
    });
  }
});

server.listen(port, host, () => {
  console.log(`SkillUp staging QA SSH OTP bridge listening on http://${host}:${port}.`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
