import { timingSafeEqual } from "node:crypto";
import http from "node:http";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4343;
const MAX_LOOKBACK_MS = 10 * 60_000;
const CLOCK_SKEW_MS = 10_000;
const BREVO_BASE_URL = "https://api.brevo.com/v3";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the staging QA mailbox bridge.`);
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
  return timestamp;
}

function extractOtp(subject, body = "") {
  const subjectMatch = /^(\d{4}) is your SkillUp sign-in code$/.exec(subject ?? "");
  if (subjectMatch?.[1]) return subjectMatch[1];

  const bodyMatch = /Your one-time code is:\s*(\d{4})\b/i.exec(body ?? "");
  return bodyMatch?.[1] ?? null;
}

function hasDeliveredEvent(events, startedAfter) {
  return Array.isArray(events)
    ? events.some((event) => {
        if (event?.name !== "delivered") return false;
        const eventTime = Date.parse(event.time ?? "");
        return Number.isFinite(eventTime) && eventTime >= startedAfter - CLOCK_SKEW_MS;
      })
    : false;
}

async function brevoJson(pathname, apiKey) {
  const response = await fetch(`${BREVO_BASE_URL}${pathname}`, {
    headers: {
      accept: "application/json",
      "api-key": apiKey,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const error = new Error(`Brevo API returned HTTP ${response.status}.`);
    Object.assign(error, { statusCode: response.status });
    throw error;
  }

  return response.json();
}

async function findDeliveredOtp(email, startedAfter, apiKey) {
  const query = new URLSearchParams({
    email,
    sort: "desc",
    limit: "20",
  });
  const list = await brevoJson(`/smtp/emails?${query.toString()}`, apiKey);
  const candidates = Array.isArray(list?.transactionalEmails) ? list.transactionalEmails : [];

  for (const candidate of candidates) {
    if (normalizeEmail(String(candidate?.email ?? "")) !== email) continue;
    const sentAt = Date.parse(candidate?.date ?? "");
    if (!Number.isFinite(sentAt) || sentAt < startedAfter - CLOCK_SKEW_MS) continue;
    if (!extractOtp(candidate?.subject)) continue;
    if (typeof candidate?.uuid !== "string" || !candidate.uuid) continue;

    let detail;
    try {
      detail = await brevoJson(`/smtp/emails/${encodeURIComponent(candidate.uuid)}`, apiKey);
    } catch (error) {
      if (error?.statusCode === 404) continue;
      throw error;
    }

    if (normalizeEmail(String(detail?.email ?? "")) !== email) continue;
    const detailDate = Date.parse(detail?.date ?? "");
    if (!Number.isFinite(detailDate) || detailDate < startedAfter - CLOCK_SKEW_MS) continue;
    if (!hasDeliveredEvent(detail?.events, startedAfter)) continue;

    const code = extractOtp(detail?.subject, detail?.body);
    if (code) return code;
  }

  return null;
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
  const now = Date.parse("2026-08-19T15:00:00.000Z");
  const after = parseAfter("2026-08-19T14:59:58.000Z", now);
  if (after !== Date.parse("2026-08-19T14:59:58.000Z")) throw new Error("after parsing failed");
  if (extractOtp("4821 is your SkillUp sign-in code") !== "4821") throw new Error("subject OTP extraction failed");
  if (extractOtp("other", "Your one-time code is: 7390") !== "7390") throw new Error("body OTP extraction failed");
  if (extractOtp("123456 is your SkillUp sign-in code") !== null) throw new Error("non-4-digit OTP accepted");
  if (!hasDeliveredEvent([{ name: "delivered", time: "2026-08-19T14:59:59.000Z" }], after)) {
    throw new Error("delivered event was not accepted");
  }
  if (hasDeliveredEvent([{ name: "sent", time: "2026-08-19T14:59:59.000Z" }], after)) {
    throw new Error("non-delivery event was accepted");
  }
  if (!constantTimeEqual("same-token", "same-token") || constantTimeEqual("same-token", "other-token")) {
    throw new Error("bearer token comparison failed");
  }
  console.log("STAGING BREVO QA MAILBOX BRIDGE SELF-TEST: PASS");
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

const apiKey = required("STAGING_BREVO_API_KEY");
const bridgeToken = required("STAGING_QA_MAILBOX_TOKEN");
const host = process.env.STAGING_QA_MAILBOX_HOST?.trim() || DEFAULT_HOST;
const port = Number.parseInt(process.env.STAGING_QA_MAILBOX_PORT ?? String(DEFAULT_PORT), 10);
const allowedEmails = qaEmailAllowlist();

if (host !== DEFAULT_HOST) throw new Error("The staging QA mailbox bridge must bind to 127.0.0.1 only.");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid staging QA mailbox bridge port.");
if (allowedEmails.size === 0) throw new Error("No staging QA email aliases are configured for the mailbox bridge.");

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

    const startedAfter = parseAfter(requestUrl.searchParams.get("after") ?? "");
    const code = await findDeliveredOtp(email, startedAfter, apiKey);
    if (!code) {
      sendJson(response, 404, { error: "otp_not_delivered_yet" });
      return;
    }

    sendJson(response, 200, { code });
  } catch (error) {
    const statusCode = error?.statusCode === 429 ? 503 : error?.statusCode >= 500 ? 503 : 400;
    sendJson(response, statusCode, {
      error: statusCode === 503 ? "mailbox_provider_unavailable" : "invalid_request",
    });
  }
});

server.listen(port, host, () => {
  console.log(`SkillUp staging QA mailbox bridge listening on http://${host}:${port}.`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
