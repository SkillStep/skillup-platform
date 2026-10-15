import { describe, expect, it } from "vitest";

import { hashAdminPassword, verifyAdminPassword } from "./admin-password.js";

describe("admin password hashing", () => {
  it("verifies the staging operator password round-trip", async () => {
    const stored = await hashAdminPassword("Abc@12345");
    expect(stored.algorithm).toBe("scrypt");
    expect(await verifyAdminPassword("Abc@12345", stored)).toBe(true);
    expect(await verifyAdminPassword("wrong-password", stored)).toBe(false);
  });
});
