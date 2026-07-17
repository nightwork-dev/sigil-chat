// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FloatingDock } from "./floating-dock";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderDock(
  props: React.ComponentProps<typeof FloatingDock.Root> = {},
) {
  return act(() => {
    root.render(
      React.createElement(
        FloatingDock.Root,
        props,
        React.createElement(FloatingDock.Trigger, null, "Open notes"),
        React.createElement(
          FloatingDock.Panel,
          {
            actions: React.createElement(FloatingDock.Expand),
            heading: "Notes",
          },
          "Panel body",
        ),
      ),
    );
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setValue?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function StatefulChild() {
  const [count, setCount] = React.useState(0);
  const [draft, setDraft] = React.useState("");

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "button",
      { onClick: () => setCount((value) => value + 1) },
      `Count ${count}`,
    ),
    React.createElement("input", {
      "aria-label": "Draft",
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        setDraft(event.currentTarget.value),
      value: draft,
    }),
  );
}

describe("FloatingDock", () => {
  it("owns uncontrolled open state and restores the anchored trigger on collapse", async () => {
    await renderDock();

    const trigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="Open floating panel"]',
    );
    expect(trigger?.className).toContain("rounded-md");
    expect(trigger?.className).toContain("h-7");
    expect(trigger?.className).toContain("justify-self-end");
    expect(trigger?.className).not.toContain("rounded-full");
    expect(trigger?.className).not.toContain("shadow-lg");

    expect(
      container.querySelector('[data-slot="floating-dock-panel"]'),
    ).toBeNull();

    await act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Open floating panel"]')
        ?.click(),
    );

    expect(
      container.querySelector('[data-slot="floating-dock-panel"]'),
    ).not.toBeNull();
    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="Open floating panel"]',
      )?.hidden,
    ).toBe(true);

    await act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Collapse floating panel"]',
        )
        ?.click(),
    );

    expect(
      container.querySelector('[data-slot="floating-dock-panel"]'),
    ).toBeNull();
    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="Open floating panel"]',
      )?.hidden,
    ).toBe(false);
  });

  it("portals a detached panel and docks it back into the stable root anchor", async () => {
    await renderDock({ defaultOpen: true });

    const dockRoot = container.querySelector(
      '[data-slot="floating-dock-root"]',
    );
    expect(
      dockRoot?.querySelector('[data-slot="floating-dock-panel"]'),
    ).not.toBeNull();

    await act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Detach floating panel"]',
        )
        ?.click(),
    );

    expect(
      dockRoot?.querySelector('[data-slot="floating-dock-panel"]'),
    ).toBeNull();
    const detachedPanel = document.body.querySelector<HTMLElement>(
      '[data-slot="floating-dock-panel"][data-detached="true"]',
    );
    expect(detachedPanel).not.toBeNull();

    await act(() =>
      detachedPanel
        ?.querySelector<HTMLButtonElement>('[aria-label="Dock floating panel"]')
        ?.click(),
    );

    expect(
      dockRoot?.querySelector('[data-slot="floating-dock-panel"]'),
    ).not.toBeNull();
  });

  it("can keep detached geometry inside the local DOM boundary", async () => {
    await renderDock({
      defaultDetached: true,
      defaultOpen: true,
      portal: false,
    });

    const dockRoot = container.querySelector(
      '[data-slot="floating-dock-root"]',
    );
    expect(
      dockRoot?.querySelector(
        '[data-slot="floating-dock-panel"][data-detached="true"]',
      ),
    ).not.toBeNull();
    expect(
      document.body.querySelector(
        ':scope > [data-slot="floating-dock-portal-host"]',
      ),
    ).toBeNull();
  });

  it("uses a caller-owned portal container for detached panels", async () => {
    const portalContainer = document.createElement("aside");
    document.body.appendChild(portalContainer);

    await renderDock({
      defaultDetached: true,
      defaultOpen: true,
      portalContainer,
    });

    expect(
      portalContainer.querySelector(
        '[data-slot="floating-dock-panel"][data-detached="true"]',
      ),
    ).not.toBeNull();

    portalContainer.remove();
  });

  it("reports controlled state changes without mutating the rendered state", async () => {
    const onOpenChange = vi.fn();
    const onDetachedChange = vi.fn();
    const onExpandedChange = vi.fn();
    await renderDock({
      detached: false,
      expanded: false,
      onDetachedChange,
      onExpandedChange,
      onOpenChange,
      open: true,
    });

    await act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Expand floating panel"]',
        )
        ?.click(),
    );
    await act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Detach floating panel"]',
        )
        ?.click(),
    );
    await act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Collapse floating panel"]',
        )
        ?.click(),
    );

    expect(onDetachedChange).toHaveBeenCalledWith(true);
    expect(onExpandedChange).toHaveBeenCalledWith(true);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(
      container.querySelector('[data-slot="floating-dock-panel"]'),
    ).not.toBeNull();
  });

  it("expands and restores the same panel node through an icon-only control", async () => {
    await act(() => {
      root.render(
        React.createElement(
          FloatingDock.Root,
          { defaultOpen: true },
          React.createElement(
            FloatingDock.Panel,
            {
              actions: React.createElement(FloatingDock.Expand),
              heading: "Notes",
            },
            React.createElement(StatefulChild),
          ),
        ),
      );
    });

    const dockRoot = container.querySelector(
      '[data-slot="floating-dock-root"]',
    );
    const panel = dockRoot?.querySelector<HTMLElement>(
      '[data-slot="floating-dock-panel"]',
    );
    const expand = panel?.querySelector<HTMLButtonElement>(
      '[aria-label="Expand floating panel"]',
    );
    expect(expand?.textContent).toBe("");

    await act(() => expand?.click());

    const expandedPanel = document.body.querySelector<HTMLElement>(
      '[data-slot="floating-dock-panel"][data-expanded="true"]',
    );
    expect(expandedPanel).toBe(panel);
    expect(dockRoot?.contains(expandedPanel)).toBe(false);
    expect(
      expandedPanel?.querySelector('[aria-label="Detach floating panel"]'),
    ).toBeNull();

    await act(() =>
      expandedPanel
        ?.querySelector<HTMLButtonElement>(
          '[aria-label="Restore floating panel"]',
        )
        ?.click(),
    );

    expect(dockRoot?.querySelector('[data-slot="floating-dock-panel"]')).toBe(
      panel,
    );
    expect(panel?.hasAttribute("data-expanded")).toBe(false);
  });

  it("makes docked geometry authoritative after a detached native resize", async () => {
    await renderDock({ defaultDetached: true, defaultOpen: true });

    const panel = document.body.querySelector<HTMLElement>(
      '[data-slot="floating-dock-panel"]',
    );
    if (!panel) throw new Error("Expected floating dock panel");
    panel.style.width = "1000px";
    panel.style.height = "900px";

    await act(() =>
      panel
        .querySelector<HTMLButtonElement>('[aria-label="Dock floating panel"]')
        ?.click(),
    );

    expect(panel.style.width).toBe("1000px");
    expect(panel.style.height).toBe("900px");
    expect(panel.className).toContain("w-full!");
    expect(panel.className).toContain("h-[min(560px,calc(100dvh-2rem))]!");
    expect(panel.className).toContain("resize-none");
  });

  it("preserves stateful panel children while detaching and docking", async () => {
    await act(() => {
      root.render(
        React.createElement(
          FloatingDock.Root,
          { defaultOpen: true },
          React.createElement(
            FloatingDock.Panel,
            { heading: "Stateful" },
            React.createElement(StatefulChild),
          ),
        ),
      );
    });

    const countButton = document.body.querySelector<HTMLButtonElement>(
      '[data-slot="floating-dock-content"] button',
    );
    const draftInput = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="Draft"]',
    );
    await act(() => countButton?.click());
    await act(() => {
      if (draftInput) setInputValue(draftInput, "Keep this draft");
    });
    const content = document.body.querySelector<HTMLElement>(
      '[data-slot="floating-dock-content"]',
    );
    if (content) content.scrollTop = 42;
    draftInput?.focus();

    await act(() =>
      document.body
        .querySelector<HTMLButtonElement>(
          '[aria-label="Detach floating panel"]',
        )
        ?.click(),
    );
    expect(document.body.textContent).toContain("Count 1");
    expect(
      document.body.querySelector<HTMLInputElement>('input[aria-label="Draft"]')
        ?.value,
    ).toBe("Keep this draft");
    expect(
      document.body.querySelector<HTMLInputElement>(
        'input[aria-label="Draft"]',
      ),
    ).toBe(draftInput);
    expect(document.activeElement).toBe(draftInput);
    expect(
      document.body.querySelector('[data-slot="floating-dock-content"]'),
    ).toBe(content);
    expect(content?.scrollTop).toBe(42);

    await act(() =>
      document.body
        .querySelector<HTMLButtonElement>('[aria-label="Dock floating panel"]')
        ?.click(),
    );
    expect(container.textContent).toContain("Count 1");
    expect(
      container.querySelector<HTMLInputElement>('input[aria-label="Draft"]')
        ?.value,
    ).toBe("Keep this draft");
    expect(
      container.querySelector<HTMLInputElement>('input[aria-label="Draft"]'),
    ).toBe(draftInput);
    expect(document.activeElement).toBe(draftInput);
    expect(content?.scrollTop).toBe(42);
  });

  it("connects trigger and panel semantics and restores focus after collapse", async () => {
    await renderDock();

    const trigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="Open floating panel"]',
    );
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    const panelId = trigger?.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();

    await act(() => trigger?.click());
    const panel = document.getElementById(panelId ?? "");
    expect(panel?.getAttribute("role")).toBe("region");
    expect(panel?.getAttribute("aria-labelledby")).toBe(`${panelId}-label`);
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(panel);

    const collapse = panel?.querySelector<HTMLButtonElement>(
      '[aria-label="Collapse floating panel"]',
    );
    collapse?.focus();
    await act(() => collapse?.click());
    expect(document.activeElement).toBe(trigger);
  });

  it("accepts a caller-owned navigation target without taking over its action", async () => {
    await act(() => {
      root.render(
        React.createElement(
          FloatingDock.Root,
          { defaultOpen: true },
          React.createElement(
            FloatingDock.Panel,
            {
              actions: React.createElement(
                FloatingDock.Expand,
                {
                  render: React.createElement("a", { href: "#full-workspace" }),
                },
                "Full workspace",
              ),
            },
            "Panel body",
          ),
        ),
      );
    });

    const expand = container.querySelector<HTMLAnchorElement>(
      'a[href="#full-workspace"]',
    );
    expect(expand?.textContent).toContain("Full workspace");
    expect(
      container
        .querySelector('[data-slot="floating-dock-panel"]')
        ?.hasAttribute("data-expanded"),
    ).toBe(false);
  });
});
