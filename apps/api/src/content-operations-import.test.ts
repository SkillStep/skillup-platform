import { describe, expect, it } from "vitest";

describe("content operations module", () => {
  it("loads without deriving an invalid refined Zod schema", async () => {
    await expect(import("./content-operations.js")).resolves.toHaveProperty(
      "createContentOperationsService",
    );
  });
});
