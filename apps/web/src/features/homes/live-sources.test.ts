import { describe, expect, it } from "vitest";

import type { ProjectWorkspaceNavSummary } from "@/lib/project-workspace-nav";
import type { Story } from "@workspace/work-items-store/types";

import { fixtureWorkSource } from "./fixtures";
import {
  artifactRowsFromRecords,
  artifactScopeForHome,
  liveWorkSource,
  routeSources,
} from "./live-sources";

const nav: ProjectWorkspaceNavSummary = {
  personalProjectId: "project-personal",
  projects: [
    {
      id: "project-1",
      name: "Commerce Platform",
      description: "Storefront and checkout.",
    },
  ],
  workspaces: [
    {
      id: "workspace-1",
      projectId: "project-1",
      name: "Checkout Reliability",
      description: "Error budget work.",
      status: "active",
      mountedProjectIds: [],
    },
  ],
};

const story: Story = {
  id: "SC.7",
  kind: "story",
  homeScopeId: "workspace-1",
  scopeBindings: [],
  provenance: {
    origin: "principal",
    actorPrincipalId: "user-1",
    createdAt: "2026-07-21T00:00:00.000Z",
  },
  revision: 2,
  epicId: "SC",
  epicTitle: "Scope composition",
  title: "Project homes",
  intent: "Orient the product around scopes.",
  acceptanceCriteria: [],
  status: "in-progress",
  routing: "implementation",
  reviewGate: "none",
  deps: [],
  authoredBy: "Owner",
  createdAt: "2026-07-21T00:00:00.000Z",
  updatedAt: "2026-07-21T01:00:00.000Z",
};

describe("home route sources", () => {
  it("uses permission-filtered live work when fixtures are disabled", () => {
    const live = liveWorkSource({
      scopeId: "project-1",
      scopeStories: [story],
      nav,
    });
    const sources = routeSources(false, [], live);

    expect(sources.work.summariesForScope("project-1")).toEqual([
      expect.objectContaining({
        id: "SC.7",
        homeScopeName: "Checkout Reliability",
      }),
    ]);
    expect(sources.resources).toEqual([]);
    expect(sources.attention).toEqual([]);
  });

  it("uses permission-filtered live artifacts when fixtures are disabled", () => {
    const live = liveWorkSource({ nav });
    const sources = routeSources(false, [], live, {
      resources: artifactRowsFromRecords([
        {
          id: "older",
          filename: "old-plan.md",
          mediaType: "text/markdown",
          size: 4,
          createdAt: "2026-07-20T00:00:00.000Z",
        },
        {
          id: "newer",
          filename: "latest-brief.png",
          mediaType: "image/png",
          size: 12,
          createdAt: "2026-07-21T00:00:00.000Z",
        },
      ]),
    });

    expect(sources.resources).toEqual([
      { id: "newer", name: "latest-brief.png", kind: "artifact" },
      { id: "older", name: "old-plan.md", kind: "artifact" },
    ]);
    expect(sources.artifacts).toEqual([]);
  });

  it("maps session artifacts separately from scope resources", () => {
    const live = liveWorkSource({ nav });
    const sources = routeSources(false, [], live, {
      artifacts: artifactRowsFromRecords([
        {
          id: "matrix",
          filename: "offer-matrix.csv",
          mediaType: "text/csv",
          size: 30,
          createdAt: "2026-07-21T00:00:00.000Z",
        },
      ]),
    });

    expect(sources.resources).toEqual([]);
    expect(sources.artifacts).toEqual([
      { id: "matrix", name: "offer-matrix.csv", kind: "artifact" },
    ]);
  });

  it("projects durable activity and attention without inventing a source scope", () => {
    const live = liveWorkSource({ nav });
    const sources = routeSources(
      false,
      [{ personaId: "eve", name: "Eve", hasPortrait: false }],
      live,
      {
        signals: {
          activity: [
            {
              id: "activity-1",
              agentPersonaId: "eve",
              occurredAt: "2026-07-21T01:00:00.000Z",
              summary: "Used publish",
              threadId: "thread-1",
            },
          ],
          attention: [
            {
              id: "attention-1",
              agentPersonaId: "eve",
              anchorId: "claim-1",
              body: "Check this claim",
              label: "Claim",
              occurredAt: "2026-07-21T01:00:00.000Z",
              threadId: "thread-1",
            },
          ],
        },
        viaProjectId: "project-1",
      },
    );

    expect(sources.activity).toEqual([
      {
        id: "activity-1",
        agentName: "Eve",
        summary: "Used publish",
        occurredAt: "2026-07-21T01:00:00.000Z",
        href: "/sessions/thread-1?via=project-1",
      },
    ]);
    expect(sources.attention).toEqual([
      {
        id: "attention-1",
        agentName: "Eve",
        subject: "Check this claim",
        notedFromName: undefined,
        href: "/sessions/thread-1?via=project-1",
      },
    ]);
  });

  it("formats artifact scopes without double-prefixing qualified ids", () => {
    expect(artifactScopeForHome("project", "project-1")).toBe(
      "project:project-1",
    );
    expect(artifactScopeForHome("project", "personal:user-1")).toBe(
      "project:personal:user-1",
    );
    expect(artifactScopeForHome("workspace", "workspace-1")).toBe(
      "workspace:workspace-1",
    );
    expect(artifactScopeForHome("session", "thread-1")).toBe(
      "session:thread-1",
    );
    expect(artifactScopeForHome("project", "project:already-qualified")).toBe(
      "project:already-qualified",
    );
  });

  it("enables fixture work only behind the explicit review flag", () => {
    const live = liveWorkSource({ nav });

    expect(routeSources(false, [], live).work).toBe(live);
    expect(routeSources(true, [], live).work).toBe(fixtureWorkSource);
    expect(
      routeSources(true, [], live, {
        resources: [{ id: "real", name: "real.md", kind: "artifact" }],
      }).resources,
    ).not.toEqual([{ id: "real", name: "real.md", kind: "artifact" }]);
  });
});
