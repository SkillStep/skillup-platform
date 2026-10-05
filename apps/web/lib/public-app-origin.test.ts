import { describe, expect, it } from "vitest";

import { publicAppOrigin } from "./public-app-origin";

describe("publicAppOrigin", () => {
  it("prefers PUBLIC_APP_URL over the container bind address", () => {
    const previous = process.env["PUBLIC_APP_URL"];
    process.env["PUBLIC_APP_URL"] = "https://skillupshop.codistan.org";
    try {
      const request = {
        nextUrl: new URL("https://0.0.0.0:3000/en/account/payment-return"),
        headers: {
          get: (name: string) => (name === "host" ? "0.0.0.0:3000" : null),
        },
      } as never;
      expect(publicAppOrigin(request)).toBe("https://skillupshop.codistan.org");
    } finally {
      if (previous === undefined) delete process.env["PUBLIC_APP_URL"];
      else process.env["PUBLIC_APP_URL"] = previous;
    }
  });
});
