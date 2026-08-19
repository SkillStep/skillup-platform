import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

const levelId = "3c315a1a-824a-413e-836d-69a9fc8bad1f";

test("unknown levels fail safely", async ({ request }) => {
  const response = await request.post(`/api/v1/gameplay/levels/${randomUUID()}/sessions`, {
    data: { locale: "en" },
  });
  expect(response.status()).toBe(404);
});

test("gameplay mutation rejects an untrusted origin", async ({ request }) => {
  const response = await request.post(`/api/v1/gameplay/levels/${levelId}/sessions`, {
    headers: { origin: "https://attacker.invalid" },
    data: { locale: "en" },
  });
  expect(response.status()).toBe(403);
});

test("repeated level start resumes the same active server-side session", async ({ request }) => {
  const first = await request.post(`/api/v1/gameplay/levels/${levelId}/sessions`, {
    data: { locale: "en" },
  });
  expect(first.ok()).toBe(true);
  const firstBody = await first.json();

  const second = await request.post(`/api/v1/gameplay/levels/${levelId}/sessions`, {
    data: { locale: "en" },
  });
  expect(second.ok()).toBe(true);
  const secondBody = await second.json();

  expect(secondBody.id).toBe(firstBody.id);
});

test("private level navigation recovers after a refresh", async ({ page }) => {
  await page.goto(`/en/learn/${levelId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Challenge \d+/)).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Challenge \d+/)).toBeVisible();
});
