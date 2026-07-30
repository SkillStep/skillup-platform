import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import process from "node:process";

const root = process.cwd();
const mode = process.argv[2] ?? "--all";
const failures = [];
const notices = [];

const requiredFiles = [
  "README.md",
  "AGENTS.md",
  "SECURITY.md",
  "package.json",
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
  ".node-version",
  ".python-version",
  ".env.example",
  "infra/compose.yaml",
  "docs/product/PRODUCT_SPEC.md",
  "docs/architecture/ARCHITECTURE.md",
  "docs/discoverability/SEO_AEO_GEO_STANDARD.md",
  "docs/design/DESIGN_ACCESSIBILITY_PERFORMANCE_STANDARD.md"
];

const requiredDirectories = [
  "apps/web",
  "apps/api",
  "services/ai-worker",
  "packages/ui",
  "packages/contracts",
  "packages/content-schema",
  "packages/discoverability",
  "packages/analytics",
  "content",
  "infra",
  "docs"
];

async function exists(path) {
  try {
    await stat(join(root, path));
    return true;
  } catch {
    return false;
  }
}

for (const path of requiredFiles) {
  if (!(await exists(path))) failures.push(`Missing required file: ${path}`);
}

for (const path of requiredDirectories) {
  if (!(await exists(path))) failures.push(`Missing required directory: ${path}`);
}

try {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  if (packageJson.private !== true) failures.push("Root package.json must remain private.");
  if (packageJson.packageManager !== "pnpm@11.17.0") {
    failures.push("Root packageManager must be pinned to pnpm@11.17.0.");
  }
  if (packageJson.engines?.node !== "24.18.x") {
    failures.push("Node.js engine must be pinned to 24.18.x for the foundation.");
  }
} catch (error) {
  failures.push(`Invalid package.json: ${error.message}`);
}

const forbiddenSecretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /mongodb\+srv:\/\/[^:\s]+:[^@\s]+@/i
];

const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  ".venv",
  "__pycache__"
]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    if (entry.isFile()) files.push(path);
  }

  return files;
}

const files = await walk(root);
for (const file of files) {
  const relativePath = relative(root, file).replaceAll("\\", "/");
  const fileName = basename(file);

  if ((fileName === ".env" || fileName.startsWith(".env.")) && fileName !== ".env.example") {
    failures.push(`Tracked/local runtime environment file found in validation scope: ${relativePath}`);
  }

  if (/\.(?:png|jpe?g|gif|webp|ico|pdf|zip|woff2?)$/i.test(fileName)) continue;

  let content;
  try {
    content = await readFile(file, "utf8");
  } catch {
    continue;
  }

  for (const pattern of forbiddenSecretPatterns) {
    if (pattern.test(content)) failures.push(`Possible secret pattern in ${relativePath}`);
  }

  if (relativePath.endsWith(".md") && content.includes("\t")) {
    notices.push(`Markdown contains a tab character: ${relativePath}`);
  }
}

const bootstrapModes = new Set(["--format", "--lint", "--types", "--test", "--build"]);
if (bootstrapModes.has(mode)) {
  notices.push(
    `${mode.slice(2)} currently validates the repository foundation only; application-specific checks become mandatory when each package is scaffolded.`
  );
}

if (notices.length > 0) {
  for (const notice of notices) console.log(`[notice] ${notice}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`[failure] ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`SkillUp foundation validation passed (${files.length} files checked, mode ${mode}).`);
}
