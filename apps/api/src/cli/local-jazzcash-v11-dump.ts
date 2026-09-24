import { readApiConfig } from "../config.js";
import { buildJazzCashV11ChargeFields } from "../jazzcash-v11.js";

function pakistanStamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}${get("hour")}${get("minute")}${get("second")}`;
}

const config = readApiConfig();
const url = config.JAZZCASH_V11_URL;
if (!url) throw new Error("JAZZCASH_V11_URL is missing");

const now = new Date();
const stamp = pakistanStamp(now);
const expiry = pakistanStamp(new Date(now.getTime() + 15 * 60_000));
const body = buildJazzCashV11ChargeFields(config, {
  amountMinor: 59_900,
  billReference: `B${stamp}`,
  description: "SkillUp premium membership",
  txnRefNo: `Goo${stamp}Z1`,
  txnDateTime: stamp,
  txnExpiryDateTime: expiry,
  msisdn: "03123456789",
  mpin: "5555",
  cnic: "345678",
});

console.log("=== METHOD / URL ===");
console.log("POST", url);
console.log("=== REQUEST HEADERS ===");
console.log(
  JSON.stringify(
    {
      accept: "application/json",
      "content-type": "application/json",
    },
    null,
    2,
  ),
);
console.log("=== REQUEST BODY ===");
console.log(JSON.stringify(body, null, 2));

const response = await fetch(url, {
  method: "POST",
  headers: {
    accept: "application/json",
    "content-type": "application/json",
  },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(30_000),
});
const text = await response.text();
console.log("=== HTTP STATUS ===");
console.log(response.status);
console.log("=== RESPONSE BODY ===");
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}
