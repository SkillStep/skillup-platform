import { expect, test } from "@playwright/test";

async function requireOk(response, label) {
  if (!response.ok()) {
    throw new Error(
      `${label} failed with HTTP ${response.status()}: ${(await response.text()).slice(0, 300)}`,
    );
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
  expect(
    sessionsBody.sessions.some((session) => session.current && session.revokedAt === null),
  ).toBe(true);
});

test("authenticated session resolves the expected QA learner", async ({ request }) => {
  const session = await request.get("/api/v1/auth/session");
  await requireOk(session, "Auth session");
  const body = await session.json();
  expect(body.learner.email.toLowerCase()).toBe(
    process.env.STAGING_QA_LEARNER_EMAIL?.trim().toLowerCase(),
  );
});

test("profile input validation rejects empty and invalid updates", async ({ request }) => {
  const empty = await request.patch("/api/v1/profile", { data: {} });
  expect(empty.status()).toBe(400);

  const invalid = await request.patch("/api/v1/profile", {
    data: { locale: "xx", displayName: "x" },
  });
  expect(invalid.status()).toBe(400);
});

test("profile update is reversible", async ({ request }) => {
  const session = await request.get("/api/v1/auth/session");
  await requireOk(session, "Auth session");
  const original = (await session.json()).learner.profile;

  const changed = await request.patch("/api/v1/profile", {
    data: {
      learningGoal: "Automated staging certification",
      onboardingStatus: "completed",
    },
  });
  await requireOk(changed, "Profile update");
  expect((await changed.json()).learner.profile.learningGoal).toBe(
    "Automated staging certification",
  );

  const restored = await request.patch("/api/v1/profile", {
    data: {
      learningGoal: original.learningGoal,
      onboardingStatus: original.onboardingStatus,
    },
  });
  await requireOk(restored, "Profile restore");
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

test("authenticated privacy export is bounded and returns learner-owned data", async ({
  request,
}) => {
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

test("invalid deletion confirmation is rejected", async ({ request }) => {
  const response = await request.post("/api/v1/account/deletion", {
    data: {
      confirmation: "NO",
      reason: "Automated staging negative test",
    },
  });
  expect(response.status()).toBe(400);
});

test("mutating account routes reject an untrusted Origin", async ({ request }) => {
  for (const [method, route, data] of [
    ["patch", "/api/v1/account/privacy", { marketingConsent: false }],
    ["patch", "/api/v1/profile", { learningGoal: "Untrusted origin" }],
    ["post", "/api/v1/account/export", undefined],
  ]) {
    const response = await request[method](route, {
      headers: { origin: "https://attacker.invalid" },
      ...(data ? { data } : {}),
    });
    expect(response.status(), route).toBe(403);
  }
});
