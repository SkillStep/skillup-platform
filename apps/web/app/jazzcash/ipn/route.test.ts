import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
const alias = readFileSync(
  new URL("../../[locale]/account/jazzcash-ipn/route.ts", import.meta.url),
  "utf8",
);

describe("JazzCash IPN public edge", () => {
  it("forwards pp_* fields to the API IPN handler", () => {
    expect(source).toContain("/v1/commercial/jazzcash/ipn");
    expect(source).toContain("collectFields");
    expect(source).toContain("export async function POST");
    expect(alias).toContain("rootPost");
  });
});
