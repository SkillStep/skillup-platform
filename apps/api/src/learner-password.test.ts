import { describe, expect, it } from "vitest";

import {
  hashLearnerPassword,
  isValidLearnerPassword,
  LEARNER_MIGRATION_PASSWORD,
  verifyLearnerPassword,
} from "./learner-password.js";

describe("learner password rules", () => {
  it("accepts the migration password shape", () => {
    expect(LEARNER_MIGRATION_PASSWORD).toBe("Abc@123");
    expect(isValidLearnerPassword(LEARNER_MIGRATION_PASSWORD)).toBe(true);
    expect(isValidLearnerPassword("short")).toBe(false);
    expect(isValidLearnerPassword("alllowercase1!")).toBe(false);
  });

  it("hashes and verifies with scrypt", async () => {
    const stored = await hashLearnerPassword(LEARNER_MIGRATION_PASSWORD);
    expect(stored.algorithm).toBe("scrypt");
    await expect(verifyLearnerPassword(LEARNER_MIGRATION_PASSWORD, stored)).resolves.toBe(true);
    await expect(verifyLearnerPassword("Wrong@123", stored)).resolves.toBe(false);
  });
});
