import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];

const allowedWorkspaceDependencies = new Map([
  ["@skillup/web", new Set(["@skillup/contracts", "@skillup/discoverability", "@skillup/ui", "@skillup/analytics"])],
  ["@skillup/api", new Set(["@skillup/contracts", "@skillup/database", "@skillup/analytics", "@skillup/content-schema"])],
  ["@skillup/database", new Set()],
  ["@skillup/contracts", new Set()],
  ["@skillup/content-schema", new Set(["@skillup/contracts"])],
  ["@skillup/discoverability", new Set(["@skillup/contracts"])],
  ["@skillup/analytics", new Set()],
  ["@skillup/ui", new Set()],
]);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

for (const packageDirectory of ["apps/web", "apps/api", "packages/database", "packages/contracts", "packages/content-schema", "packages/discoverability", "packages/analytics", "packages/ui"]) {
  const manifestPath = join(root, packageDirectory, "package.json");
  const manifest = await readJson(manifestPath);
  const allowed = allowedWorkspaceDependencies.get(manifest.name);

  if (!allowed) {
    failures.push(`No boundary policy is defined for ${manifest.name}.`);
    continue;
  }

  const dependencies = {
    ...(manifest.dependencies ?? {}),
    ...(manifest.devDependencies ?? {}),
    ...(manifest.peerDependencies ?? {}),
  };

  for (const dependencyName of Object.keys(dependencies)) {
    if (dependencyName.startsWith("@skillup/") && !allowed.has(dependencyName)) {
      failures.push(`${manifest.name} may not depend on ${dependencyName}.`);
    }
  }
}

const sourceRoots = ["apps", "packages", "services"];
const forbiddenRelativePattern = /from\s+["'][^"']*(?:apps|services)\//;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (["node_modules", "dist", ".next", "coverage", "__pycache__"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    if (entry.isFile() && /\.(?:ts|tsx|js|mjs|py)$/.test(entry.name)) files.push(path);
  }

  return files;
}

for (const sourceRoot of sourceRoots) {
  const files = await walk(join(root, sourceRoot));
  for (const file of files) {
    const content = await readFile(file, "utf8");
    const displayPath = relative(root, file).replaceAll("\\", "/");

    if (displayPath.startsWith("packages/") && forbiddenRelativePattern.test(content)) {
      failures.push(`Shared package imports an application/service path: ${displayPath}.`);
    }

    if (displayPath.startsWith("apps/web/") && content.includes("@skillup/database")) {
      failures.push(`Browser/web source must not import the database package: ${displayPath}.`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`[boundary failure] ${failure}`);
  process.exitCode = 1;
} else {
  console.log("SkillUp workspace dependency boundaries passed.");
}
