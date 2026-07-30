import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BrandMark } from "./index.js";

describe("BrandMark", () => {
  it("exposes the product name and hides decorative SVG detail", () => {
    const markup = renderToStaticMarkup(<BrandMark />);

    expect(markup).toContain('aria-label="SkillUp"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("SkillUp</span>");
  });
});
