import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./admin-password-form.tsx", import.meta.url), "utf8");

describe("AdminPasswordForm", () => {
  it("keeps the account-flow field styling and empty manual email/password inputs", () => {
    expect(source).toContain('className={styles["form"]}');
    expect(source).toContain('className={styles["field"]}');
    expect(source).toContain('className={styles["label"]}');
    expect(source).toContain('className={styles["input"]}');
    expect(source).toContain('className={styles["action"]}');
    expect(source).toContain('useState("")');
    expect(source).not.toContain("staging.admin@skillup.test");
  });
});
