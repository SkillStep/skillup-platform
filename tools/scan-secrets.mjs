import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".pnpm-store",
  "artifacts",
  "coverage",
  "dist",
  "node_modules",
]);
const ignoredExtensions = new Set([
  ".avif",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".lock",
  ".pdf",
  ".png",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);
const maximumFileBytes = 2 * 1_024 * 1_024;

const signatures = [
  {
    name: "private key material",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "OpenAI-style secret", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: "Slack token", pattern: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/ },
];

function files(directory) {
  const discovered = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) discovered.push(...files(path));
    else if (entry.isFile()) discovered.push(path);
  }
  return discovered;
}

const findings = [];
for (const path of files(root)) {
  if (ignoredExtensions.has(extname(path).toLowerCase())) continue;
  const stat = lstatSync(path);
  if (stat.size > maximumFileBytes) continue;

  const content = readFileSync(path, "utf8");
  if (content.includes("\u0000")) continue;
  for (const signature of signatures) {
    if (signature.pattern.test(content)) {
      findings.push(`${relative(root, path)}: ${signature.name}`);
    }
  }
}

if (findings.length > 0) {
  throw new Error(`Potential committed secrets detected:\n${findings.join("\n")}`);
}

console.log("SkillUp high-confidence committed-secret scan passed.");
