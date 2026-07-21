import { describe, expect, it } from "vitest";

import type { ProjectWorkspaceNavSummary } from "@/lib/project-workspace-nav";
import type { Story } from "@workspace/work-items-store/types";

import { fixtureWorkSource } from "./fixtures";
import { liveWorkSource, routeSources } from "./live-sources";

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

  it("enables fixture work only behind the explicit review flag", () => {
    const live = liveWorkSource({ nav });

    expect(routeSources(false, [], live).work).toBe(live);
    expect(routeSources(true, [], live).work).toBe(fixtureWorkSource);
  });
});
