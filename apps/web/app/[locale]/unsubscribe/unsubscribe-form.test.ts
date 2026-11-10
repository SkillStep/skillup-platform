import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const form = readFileSync(new URL("./unsubscribe-form.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../discovery-shell.tsx", import.meta.url), "utf8");

describe("public Unsubscribe by JazzCash MSISDN", () => {
  it("keeps Unsubscribe always visible in primary navigation", () => {
    expect(shell).toContain('href="/en/unsubscribe"');
    expect(shell).toContain(">Unsubscribe<");
    expect(shell.match(/href="\/en\/unsubscribe"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("looks up subscription before confirming cancel", () => {
    expect(form).toContain("/api/v1/commercial/premium/unsubscribe/lookup");
    expect(form).toContain("/api/v1/commercial/premium/unsubscribe/confirm");
    expect(form).toContain("Are you sure you want to cancel");
    expect(form).toContain("confirm: true");
  });

  it("shows the no-subscription error with pricing link", () => {
    expect(form).toContain("You don&apos;t have any active subscription.");
    expect(form).toContain('href="/en/pricing"');
    expect(form).toContain("Click Here to view plans");
  });

  it("keeps the unsubscribe page out of search indexes", () => {
    expect(page).toContain("robots: { index: false, follow: false, noarchive: true }");
  });
});
