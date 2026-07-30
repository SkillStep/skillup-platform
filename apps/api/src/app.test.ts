import { afterEach, describe, expect, it } from "vitest";

import { buildApi } from "./app.js";

const applications: ReturnType<typeof buildApi>[] = [];

function createTestApi() {
  const app = buildApi({
    config: {
      APP_ENV: "test",
      API_HOST: "127.0.0.1",
      API_PORT: 3001,
      RELEASE_SHA: "test-sha",
      LOG_LEVEL: "silent",
    },
    now: () => new Date("2026-07-30T00:00:00.000Z"),
  });
  applications.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.close()));
});

describe("SkillUp API", () => {
  it("returns versioned, non-cacheable health metadata", async () => {
    const response = await createTestApi().inject({ method: "GET", url: "/v1/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({
      status: "ok",
      service: "skillup-api",
      version: "0.0.0",
      releaseSha: "test-sha",
      timestamp: "2026-07-30T00:00:00.000Z",
    });
  });

  it("returns a bounded error contract without echoing the path", async () => {
    const response = await createTestApi().inject({
      method: "GET",
      url: "/v1/private-user-data",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      code: "not_found",
      message: "The requested API resource was not found.",
    });
    expect(response.body).not.toContain("private-user-data");
  });
});
