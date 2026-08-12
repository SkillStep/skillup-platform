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
      testMatch:
        /public\.spec\.mjs|auth-ui\.spec\.mjs|auth-negative\.spec\.mjs|runtime-ui\.spec\.mjs/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "learner-desktop",
      dependencies: ["auth-setup"],
      testMatch: /learner\.spec\.mjs|premium\.spec\.mjs|account\.spec\.mjs|gameplay-negative\.spec\.mjs/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(authRoot, "learner.json"),
      },
    },
    {
      name: "learner-mobile",
      dependencies: ["auth-setup"],
      testMatch: /learner\.spec\.mjs|premium\.spec\.mjs|responsive\.spec\.mjs/,
      use: {
        ...devices["Pixel 7"],
        storageState: path.join(authRoot, "learner.json"),
      },
    },
    {
      name: "free-learner-desktop",
      dependencies: ["auth-setup"],
      testMatch: /free-learner\.spec\.mjs/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(authRoot, "free-learner.json"),
      },
    },
    {
      name: "onboarding-desktop",
      dependencies: ["auth-setup"],
      testMatch: /onboarding\.spec\.mjs/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(authRoot, "onboarding.json"),
      },
    },
    {
      name: "admin-desktop",
      dependencies: ["auth-setup"],
      testMatch: /admin\.spec\.mjs|ai\.spec\.mjs|premium-operations\.spec\.mjs/,
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
      name: "publisher-desktop",
      dependencies: ["auth-setup"],
      testMatch: /publisher\.spec\.mjs/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(authRoot, "publisher.json"),
      },
    },
    {
      name: "payment-operator-desktop",
      dependencies: ["auth-setup"],
      testMatch: /payment-operator\.spec\.mjs/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(authRoot, "payment-operator.json"),
      },
    },
    {
      name: "learner-support-desktop",
      dependencies: ["auth-setup"],
      testMatch: /learner-support\.spec\.mjs/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(authRoot, "learner-support.json"),
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
