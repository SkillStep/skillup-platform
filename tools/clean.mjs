import { rm } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

const directories = [
  "apps/web/.next",
  "apps/api/dist",
  "packages/ui/dist",
  "packages/contracts/dist",
  "packages/content-schema/dist",
  "packages/discoverability/dist",
  "packages/analytics/dist",
  "coverage",
];

for (const directory of directories) {
  await rm(join(process.cwd(), directory), { force: true, recursive: true });
}

console.log(`Removed ${directories.length} known generated directories.`);
