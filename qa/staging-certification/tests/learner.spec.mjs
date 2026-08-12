import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

const levelIds = [
  "3c315a1a-824a-413e-836d-69a9fc8bad1f",
  "a708cd04-e1a1-41b7-8fd8-fbb777a295df",
  "61ef5b63-c813-49bb-87d2-03f43d815643",
  "04b5c54c-31c9-40b8-8800-e8938fa66117",
  "80753a55-0795-4cd4-8c80-d9ba33ff70a4",
];

const expectedChallengeTypes = new Set([
  "multiple_choice",
  "true_false",
  "ordering",
  "matching",
  "scenario",
  "fill_blank",
  "short_response",
]);

async function requireOk(response, label) {
  if (!response.ok()) {
    throw new Error(
      `${label} failed with HTTP ${response.status()}: ${(await response.text()).slice(0, 300)}`,
    );
  }
}

function responseFor(challenge) {
  switch (challenge.type) {
    case "multiple_choice":
    case "scenario":
      return { type: challenge.type, selectedOptionKeys: [challenge.options[0].key] };
    case "true_false":
      return { type: challenge.type, selectedOptionKey: challenge.options[0].key };
    case "ordering":
      return {
        type: challenge.type,
        orderedOptionKeys: challenge.options.map((option) => option.key),
      };
    case "matching":
      return {
        type: challenge.type,
        matches: challenge.left.map((left, index) => ({
          leftKey: left.key,
          rightKey: challenge.right[index]?.key ?? challenge.right[0].key,
        })),
      };
    case "fill_blank":
    case "short_response":
      return { type: challenge.type, value: "Staging QA response" };
    default:
      throw new Error(`Unsupported challenge type: ${challenge.type}`);
  }
}

async function submit(request, session, challenge, idempotencyKey = randomUUID()) {
  const response = await request.post(`/api/v1/gameplay/sessions/${session.id}/submissions`, {
    data: {
      challengeId: challenge.id,
      challengeVersionId: challenge.versionId,
      idempotencyKey,
      response: responseFor(challenge),
    },
  });
  await requireOk(response, "Challenge submission");
  return response.json();
}

test("QA learner has Premium capability authority", async ({ request }) => {
  const response = await request.get("/api/v1/account/capabilities");
  await requireOk(response, "Capability lookup");
  const capabilities = await response.json();
  expect(capabilities.tier).toBe("premium");
  expect(capabilities.unlimitedMissions).toBe(true);
  expect(capabilities.missionsRemainingToday).toBeNull();
});

test("all five launch entry levels execute and exercise every challenge type", async ({
  request,
}) => {
  const observedTypes = new Set();
  let replayChecked = false;

  for (const levelId of levelIds) {
    const started = await request.post(`/api/v1/gameplay/levels/${levelId}/sessions`, {
      data: { locale: "en" },
    });
    await requireOk(started, `Gameplay session start for ${levelId}`);
    let session = await started.json();
    let submissions = 0;

    while (session.state === "active" && session.currentChallenge && submissions < 30) {
      const challenge = session.currentChallenge;
      observedTypes.add(challenge.type);

      if (!replayChecked) {
        const key = randomUUID();
        const first = await submit(request, session, challenge, key);
        const replay = await submit(request, session, challenge, key);
        expect(replay).toEqual(first);
        session = first.session;
        replayChecked = true;
        submissions += 1;
        if (!first.result.retryAllowed) continue;
      }

      const outcome = await submit(request, session, challenge);
      session = outcome.session;
      submissions += 1;
    }

    expect(session.state).toBe("completed");
  }

  expect(replayChecked).toBe(true);
  expect([...observedTypes].sort()).toEqual([...expectedChallengeTypes].sort());
});

test("authenticated learner UI renders progress and a playable level", async ({ page }) => {
  const progress = await page.goto("/en/progress");
  expect(progress?.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.goto(`/en/learn/${levelIds[0]}`);
  await expect(page.getByText(/Challenge \d+/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Check answer" })).toBeVisible();
});
