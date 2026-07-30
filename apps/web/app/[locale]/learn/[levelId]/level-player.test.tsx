import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LevelPlayer } from "./level-player";

describe("playable level shell", () => {
  it("renders a low-bandwidth recovery state before private session data arrives", () => {
    const markup = renderToStaticMarkup(
      createElement(LevelPlayer, {
        levelId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
        locale: "en",
      }),
    );

    expect(markup).toContain("Preparing your level");
    expect(markup).toContain("restoring your exact challenge and saved progress");
    expect(markup).not.toContain("privateEvaluation");
    expect(markup).not.toContain("correctOptionKeys");
  });
});
