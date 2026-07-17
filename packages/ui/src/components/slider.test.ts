import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Slider } from "./slider";

describe("Slider", () => {
  it("renders one thumb for a scalar controlled value", () => {
    const html = renderToStaticMarkup(createElement(Slider, { value: 42 }));
    expect(html.match(/data-slot="slider-thumb"/g)).toHaveLength(1);
  });

  it("renders one thumb for a scalar default value", () => {
    const html = renderToStaticMarkup(
      createElement(Slider, { defaultValue: 42 }),
    );
    expect(html.match(/data-slot="slider-thumb"/g)).toHaveLength(1);
  });

  it("renders one thumb per ranged value", () => {
    const html = renderToStaticMarkup(
      createElement(Slider, { value: [20, 80] }),
    );
    expect(html.match(/data-slot="slider-thumb"/g)).toHaveLength(2);
  });
});
