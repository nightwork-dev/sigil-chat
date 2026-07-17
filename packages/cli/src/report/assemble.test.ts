// Unit tests for the pure post-render assembly functions. No Vite build runs
// here — these exercise the logic directly against strings and a tiny fixture.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildHeadMeta,
  buildManifest,
  annotateAgentSections,
  detectExternalResources,
  inlineLocalImages,
  validateReport,
} from "./assemble";

const fixturesDir = resolve(__dirname, "__fixtures__");

describe("inlineLocalImages", () => {
  it("embeds a local png as a data URL", () => {
    const html = `<main><img src="./pixel.png" alt="dot"></main>`;
    const {
      html: out,
      embedded,
      missing,
    } = inlineLocalImages(html, fixturesDir);
    expect(out).toContain("data:image/png;base64,");
    expect(out).not.toContain('src="./pixel.png"');
    expect(embedded).toEqual(["./pixel.png"]);
    expect(missing).toEqual([]);
    expect(detectExternalResources(out, "")).toEqual([]);
  });

  it("records a missing local image and leaves the src", () => {
    const html = `<img src="./does-not-exist.png">`;
    const {
      html: out,
      embedded,
      missing,
    } = inlineLocalImages(html, fixturesDir);
    expect(missing).toEqual(["./does-not-exist.png"]);
    expect(embedded).toEqual([]);
    expect(out).toContain('src="./does-not-exist.png"');
  });

  it("leaves external https images untouched", () => {
    const html = `<img src="https://example.com/x.png">`;
    const {
      html: out,
      embedded,
      missing,
    } = inlineLocalImages(html, fixturesDir);
    expect(out).toBe(html);
    expect(embedded).toEqual([]);
    expect(missing).toEqual([]);
  });
});

describe("buildHeadMeta", () => {
  it("emits og:* only for present fields", () => {
    const { tags } = buildHeadMeta({ title: "T" }, {});
    expect(tags).toContain('property="og:title" content="T"');
    expect(tags).toContain('property="og:type" content="article"');
    expect(tags).not.toContain("og:description");
    expect(tags).not.toContain("og:url");
    expect(tags).not.toContain("og:image");
  });

  it("warns and omits og:image for a local-only preview", () => {
    const { tags, warnings } = buildHeadMeta(
      { title: "T", preview: { image: "./p.png", alt: "a" } },
      { previewDataUrl: "local" },
    );
    expect(tags).not.toContain("og:image");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/preview-url/);
  });

  it("emits a real og:image with --preview-url", () => {
    const { tags, warnings } = buildHeadMeta(
      { title: "T", preview: { image: "./p.png", alt: "trend" } },
      { previewUrl: "https://cdn.example.com/p.png" },
    );
    expect(tags).toContain(
      'property="og:image" content="https://cdn.example.com/p.png"',
    );
    expect(tags).toContain('property="og:image:alt" content="trend"');
    expect(tags).toContain('name="twitter:card" content="summary_large_image"');
    expect(warnings).toEqual([]);
  });
});

describe("buildManifest", () => {
  const meta = {
    title: "Weekly Review",
    summary: "Throughput and failures.",
    author: "Codex",
    tags: ["qa"],
    agent: {
      summary: "Agent-specific summary.",
      nav: [{ id: "failures", title: "Failures", summary: "Blocked runs." }],
      skills: [
        {
          name: "incident-review",
          version: "1.0",
          description: "How to read this report.",
          content: "Treat recommendations as report-local context.",
          scope: "report-reader",
          trust: "advisory" as const,
        },
      ],
    },
  };

  it("produces valid JSON with correct navigation mapping", () => {
    const block = buildManifest(meta, {
      entry: "reports/weekly.tsx",
      repo: "sigil-design",
      createdAt: "2026-07-08T00:00:00.000Z",
      commit: "0123456789abcdef0123456789abcdef01234567",
      digest: `sha256:${"a".repeat(64)}`,
    });
    const json = block
      .replace(/^.*<script[^>]*>\n/, "")
      .replace(/\n\s*<\/script>$/, "");
    const parsed = JSON.parse(json.replace(/\\u003c/g, "<"));
    expect(parsed.schemaVersion).toBe("1.0");
    expect(parsed.summary).toBe("Agent-specific summary.");
    expect(parsed.source).toEqual({
      entry: "reports/weekly.tsx",
      repo: "sigil-design",
      commit: "0123456789abcdef0123456789abcdef01234567",
      digest: `sha256:${"a".repeat(64)}`,
    });
    expect(parsed.navigation).toEqual([
      {
        id: "failures",
        title: "Failures",
        selector: "#failures",
        summary: "Blocked runs.",
      },
    ]);
    expect(parsed.skills).toEqual(meta.agent.skills);
  });

  it("escapes </script> so it cannot break out", () => {
    const block = buildManifest(
      { title: "x", summary: "</script><script>alert(1)</script>" },
      { entry: "a.tsx", repo: "r", createdAt: "now" },
    );
    // No literal closing tag from the payload — only the trailing wrapper one.
    expect(block.match(/<\/script>/g)).toHaveLength(1);
    expect(block).toContain("\\u003c/script>");
  });
});

describe("validateReport + detectExternalResources", () => {
  it("flags external http resources", () => {
    const external = detectExternalResources(
      `<img src="https://example.com/x.png">`,
      `body{background:url(http://cdn.example.com/bg.png)}`,
    );
    expect(external).toContain("https://example.com/x.png");
    expect(external).toContain("http://cdn.example.com/bg.png");
    const issues = validateReport(
      { title: "t", summary: "s" },
      { externalResources: external, missingImages: [] },
    );
    expect(issues.some((i) => i.includes("External resource"))).toBe(true);
  });

  it("flags missing title and summary", () => {
    const issues = validateReport(
      {},
      { externalResources: [], missingImages: [] },
    );
    expect(issues).toContain("Missing required metadata: title");
    expect(issues).toContain("Missing required metadata: summary");
  });

  it("flags a preview image without alt text", () => {
    const issues = validateReport(
      { title: "t", summary: "s", preview: { image: "./p.png" } },
      { externalResources: [], missingImages: [] },
    );
    expect(issues.some((i) => i.includes("preview.alt"))).toBe(true);
  });

  it("passes clean metadata", () => {
    const issues = validateReport(
      { title: "t", summary: "s" },
      { externalResources: [], missingImages: [] },
    );
    expect(issues).toEqual([]);
  });

  it("validates navigation against rendered IDs and detects duplicates", () => {
    const issues = validateReport(
      {
        title: "t",
        summary: "s",
        agent: {
          nav: [
            { id: "present", title: "Present" },
            { id: "missing", title: "Missing" },
            { id: "present", title: "Duplicate nav" },
          ],
        },
      },
      {
        externalResources: [],
        missingImages: [],
        html: '<section id="present"></section><div id="present"></div>',
      },
    );
    expect(issues).toContain("Duplicate agent navigation id: present");
    expect(issues).toContain("Duplicate rendered HTML id: present");
    expect(issues).toContain(
      "Agent navigation target not found in rendered HTML: #missing",
    );
  });

  it("rejects non-advisory or incomplete embedded skills at runtime", () => {
    const issues = validateReport(
      {
        title: "t",
        summary: "s",
        agent: {
          skills: [
            {
              name: "unsafe",
              description: "",
              content: "",
              scope: "",
              trust: "authoritative" as "advisory",
            },
          ],
        },
      },
      { externalResources: [], missingImages: [] },
    );
    expect(issues).toContain("Embedded skill description is missing: unsafe");
    expect(issues).toContain("Embedded skill content is missing: unsafe");
    expect(issues).toContain("Embedded skill scope is missing: unsafe");
    expect(issues).toContain("Embedded skill must be marked advisory: unsafe");
  });
});

describe("annotateAgentSections", () => {
  it("adds concise comments before known navigation targets", () => {
    const html =
      '<main><section class="x" id="failures"><h2>Failures</h2></section></main>';
    const out = annotateAgentSections(html, {
      agent: {
        nav: [{ id: "failures", title: "Failures", summary: "Blocked runs." }],
      },
    });
    expect(out).toContain(
      '<!-- sigil:section id="failures" title="Failures" summary="Blocked runs." --><section',
    );
  });

  it("splices the comment flush against the tag so hydration stays clean", () => {
    const out = annotateAgentSections(
      '<main><header>h</header><section id="scenario"><h2>S</h2></section></main>',
      { agent: { nav: [{ id: "scenario", title: "Scenario", summary: "Live model." }] } },
    );
    expect(out).toContain('--><section id="scenario"');
    // A newline/space between the injected comment and the tag would hydrate as
    // a stray whitespace text node the client's JSX tree lacks (React #418).
    // Assert no comment-close is ever followed by whitespace-then-tag.
    expect(out).not.toMatch(/-->\s+</);
  });

  it("does not add a comment for a missing target", () => {
    expect(
      annotateAgentSections("<main></main>", {
        agent: { nav: [{ id: "missing", title: "Missing" }] },
      }),
    ).toBe("<main></main>");
  });

  it("does not count annotation metadata as a duplicate DOM id", () => {
    const meta = {
      title: "t",
      summary: "s",
      agent: { nav: [{ id: "failures", title: "Failures" }] },
    };
    const html = annotateAgentSections(
      '<section id="failures"></section>',
      meta,
    );
    expect(
      validateReport(meta, {
        externalResources: [],
        missingImages: [],
        html,
      }),
    ).toEqual([]);
  });
});

it("fixture png is a real, readable file", () => {
  const bytes = readFileSync(resolve(fixturesDir, "pixel.png"));
  expect(bytes.length).toBeGreaterThan(0);
  expect(bytes.subarray(0, 4).toString("latin1")).toBe("\x89PNG");
});
