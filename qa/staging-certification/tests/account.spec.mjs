import { expect, test } from "@playwright/test";

async function requireOk(response, label) {
  if (!response.ok()) {
    throw new Error(`${label} failed with HTTP ${response.status()}: ${(await response.text()).slice(0, 300)}`);
  }
}

test("account settings and active session are available to the authenticated learner", async ({
  page,
  request,
}) => {
  const account = await page.goto("/en/account");
  expect(account?.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const sessions = await request.get("/api/v1/account/sessions");
  await requireOk(sessions, "Account sessions");
  const sessionsBody = await sessions.json();
  expect(sessionsBody.sessions.some((session) => session.current && session.revokedAt === null)).toBe(
    true,
  );
});

test("privacy preferences persist and can be restored", async ({ request }) => {
  const initial = await request.get("/api/v1/account/privacy");
  await requireOk(initial, "Initial privacy settings");
  const original = await initial.json();
  const changedValue = !original.marketingConsent;

  const changed = await request.patch("/api/v1/account/privacy", {
    data: { marketingConsent: changedValue },
  });
  await requireOk(changed, "Privacy update");
  const changedBody = await changed.json();
  expect(changedBody.marketingConsent).toBe(changedValue);

  const restored = await request.patch("/api/v1/account/privacy", {
    data: { marketingConsent: original.marketingConsent },
  });
  await requireOk(restored, "Privacy restore");
  const restoredBody = await restored.json();
  expect(restoredBody.marketingConsent).toBe(original.marketingConsent);
});

test("authenticated privacy export is bounded and returns learner-owned data", async ({ request }) => {
  const exported = await request.post("/api/v1/account/export");
  await requireOk(exported, "Account privacy export");
  const body = await exported.json();
  expect(body).toBeTruthy();
  expect(JSON.stringify(body).length).toBeGreaterThan(20);
});

test("account deletion enters cooldown and can be safely cancelled", async ({ request }) => {
  const deletion = await request.post("/api/v1/account/deletion", {
    data: {
      confirmation: "DELETE",
      reason: "Automated staging certification cancellation test",
    },
  });
  expect(deletion.status()).toBe(202);
  const body = await deletion.json();
  expect(body.status).toBe("cooldown");
  expect(body.requestId).toBeTruthy();

  const cancelled = await request.delete("/api/v1/account/deletion");
  await requireOk(cancelled, "Deletion cancellation");
  expect(await cancelled.json()).toEqual({ cancelled: true });
});

test("mutating account routes reject an untrusted Origin", async ({ request }) => {
  const response = await request.patch("/api/v1/account/privacy", {
    headers: { origin: "https://attacker.invalid" },
    data: { marketingConsent: false },
  });
  expect(response.status()).toBe(403);
});
