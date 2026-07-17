import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FloatingDock } from "./floating-dock";

describe("FloatingDock SSR", () => {
  it("renders a detached default inline until a browser portal is available", () => {
    const html = renderToString(
      React.createElement(
        FloatingDock.Root,
        { defaultDetached: true, defaultOpen: true },
        React.createElement(FloatingDock.Panel, null, "Panel body"),
      ),
    );

    expect(html).toContain('data-slot="floating-dock-panel"');
    expect(html).toContain("Panel body");
  });
});
