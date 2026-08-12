import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, request as requestFactory, test } from "@playwright/test";

import { createAuthenticatedState, qaIdentity } from "../helpers/identity.mjs";

function baseUrl() {
  const value = process.env.STAGING_WEB_URL?.trim();
  if (!value) throw new Error("STAGING_WEB_URL is required.");
  return value;
}

test("revoking the current session invalidates that session server-side", async () => {
  const statePath = path.join(os.tmpdir(), `skillup-session-${Date.now()}.json`);
  await createAuthenticatedState(qaIdentity("STAGING_QA_ONBOARDING_EMAIL"), statePath);
  const origin = new URL(baseUrl()).origin;
  const context = await requestFactory.newContext({
    baseURL: baseUrl(),
    storageState: statePath,
    extraHTTPHeaders: { origin },
  });

  try {
    const sessions = await context.get("/api/v1/account/sessions");
    expect(sessions.ok()).toBe(true);
    const body = await sessions.json();
    const current = body.sessions.find((session) => session.current && session.revokedAt === null);
    expect(current?.id).toBeTruthy();

    const revoked = await context.delete(`/api/v1/account/sessions/${current.id}`);
    expect(revoked.ok()).toBe(true);

    const after = await context.get("/api/v1/auth/session");
    expect(after.status()).toBe(401);
  } finally {
    await context.dispose();
    await fs.rm(statePath, { force: true });
  }
});

test("cleared browser authentication redirects a private page to sign-in", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/en/progress");
  await page.waitForURL(/\/en\/sign-in(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Pick up where you left off." })).toBeVisible();
});
