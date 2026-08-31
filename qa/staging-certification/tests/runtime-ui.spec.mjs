import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("web health exposes security headers and no-cache release metadata", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  const headers = response.headers();
  expect(headers["cache-control"] ?? "").toContain("no-store");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["content-security-policy"] ?? "").toContain("default-src 'none'");
  const body = await response.json();
  expect(body.releaseSha).toBe(process.env.STAGING_EXPECTED_RELEASE_SHA);
  expect(body.pipelineId).toBe(process.env.STAGING_DEPLOYMENT_PIPELINE_ID);
});

test("bounded read-only staging capacity smoke stays within the reviewed latency budget", async () => {
  test.setTimeout(60_000);
  const result = spawnSync(process.execPath, [path.join(root, "tools", "staging-capacity-smoke.mjs")], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
  });

  if (result.stdout) console.log(result.stdout.trim());
  if (result.stderr) console.error(result.stderr.trim());
  expect(result.status, result.stderr || result.stdout || "Capacity smoke did not return a status.").toBe(
    0,
  );
});

test("PWA manifest and offline fallback are deployable", async ({ request, page }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  const body = await manifest.json();
  expect(body.name).toMatch(/SkillUp/i);
  expect(body.start_url).toBeTruthy();

  const offline = await page.goto("/offline");
  expect(offline?.ok()).toBeTruthy();
  await expect(page.getByRole("main")).toBeVisible();
});

test("critical public navigation survives refresh, back and forward", async ({ page }) => {
  await page.goto("/en/skills");
  await page.goto("/en/pricing");
  await page.goBack();
  await expect(page).toHaveURL(/\/en\/skills$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/en\/pricing$/);
  await page.reload();
  await expect(page.getByText(/(?:PKR|Rs)\s*599\s*\/\s*month/i).first()).toBeVisible();
});

test("critical public pages do not emit uncaught page errors", async ({ page, request }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  for (const route of ["/en", "/en/skills", "/en/pricing", "/en/sign-in"]) {
    const httpResponse = await request.get(route);
    expect(httpResponse.ok(), `${route} should return a successful HTTP response`).toBe(true);

    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page, `${route} should finish browser navigation`).toHaveURL(
      new RegExp(`${route.replaceAll("/", "\\/")}$`),
    );
    await expect(page.getByRole("main"), `${route} should render its main landmark`).toBeVisible();
    expect(errors, `${route} should not emit an uncaught page error`).toEqual([]);
  }
});
