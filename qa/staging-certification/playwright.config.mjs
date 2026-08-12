import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

const directory = path.dirname(fileURLToPath(import.meta.url));
const baseURL = process.env.STAGING_WEB_URL;

if (!baseURL) {
  throw new Error("STAGING_WEB_URL is required for staging certification.");
}

const artifactsRoot = path.resolve(directory, "artifacts");
const authRoot = path.join(artifactsRoot, ".auth");

export default defineConfig({
  testDir: path.join(directory, "tests"),
  outputDir: path.join(artifactsRoot, "test-results"),
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["line"],
    ["html", { outputFolder: path.join(artifactsRoot, "html"), open: "never" }],
    ["json", { outputFile: path.join(artifactsRoot, "playwright-results.json") }],
  ],
  use: {
    baseURL,
    ignoreHTTPSErrors: false,
    screenshot: "only-on-failure",
    trace: "off",
    video: "off",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "auth-setup",
      testMatch: /auth\.setup\.mjs/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "public-desktop",
      testMatch: /public\.spec\.mjs|auth-ui\.spec\.mjs/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "learner-desktop",
      dependencies: ["auth-setup"],
      testMatch: /learner\.spec\.mjs|premium\.spec\.mjs|account\.spec\.mjs/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(authRoot, "learner.json"),
      },
    },
    {
      name: "learner-mobile",
      dependencies: ["auth-setup"],
      testMatch: /learner\.spec\.mjs|premium\.spec\.mjs/,
      use: {
        ...devices["Pixel 7"],
        storageState: path.join(authRoot, "learner.json"),
      },
    },
    {
      name: "admin-desktop",
      dependencies: ["auth-setup"],
      testMatch: /admin\.spec\.mjs|ai\.spec\.mjs/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(authRoot, "admin.json"),
      },
    },
    {
      name: "analyst-desktop",
      dependencies: ["auth-setup"],
      testMatch: /analyst\.spec\.mjs/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(authRoot, "analyst.json"),
      },
    },
    {
      name: "visual-desktop",
      dependencies: ["auth-setup"],
      testMatch: /visual\.spec\.mjs/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(authRoot, "admin.json"),
      },
    },
  ],
});
