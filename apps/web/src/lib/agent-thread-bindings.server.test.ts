import type { KvStore } from "@gonk/store/types";
import { describe, expect, it } from "vitest";

import { PersonalScopeRegistry } from "../../../agent/agent/lib/personal-scope";
import { ProjectRegistry } from "../../../agent/agent/lib/project-registry";
import { ScopeGrantRegistry } from "../../../agent/agent/lib/scope-grant-registry";
import { ProjectWorkspaceScopeRegistry } from "../../../agent/agent/lib/scope-registry";
import { WorkspaceRegistry } from "../../../agent/agent/lib/workspace-registry";
import { createThreadBindingService } from "./agent-thread-bindings.server";
import { resolveScopePerspective } from "./agent-thread-containers.server";
import {
  AgentThreadRepository,
  type AgentThread,
  type AgentThreadKvStore,
  type AgentThreadPreference,
} from "./agent-threads-domain";

const PRINCIPAL = "user-grantee";
const OWNER = "user-owner";
const PROJECT = "project-home";
const WORKSPACE = "workspace-mounted";

class MemoryKv<T> implements AgentThreadKvStore<T>, KvStore<T> {
  private readonly values = new Map<string, T>();

  delete(key: string): void {
    this.values.delete(key);
  }

  get(key: string): T | undefined {
    const value = this.values.get(key);
    return value === undefined ? undefined : structuredClone(value);
  }

  set(key: string, value: T): void {
    this.values.set(key, structuredClone(value));
  }

  patch(key: string, patch: Partial<T>): T {
    const current = this.get(key);
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      throw new Error(`Cannot patch ${key}.`);
    }
    const updated = { ...current, ...patch } as T;
    this.set(key, updated);
    return updated;
  }

  entries(prefix = ""): Array<{ key: string; value: T }> {
    return [...this.values.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => ({ key, value: structuredClone(value) }));
  }

  list(prefix = ""): string[] {
    return [...this.values.keys()].filter((key) => key.startsWith(prefix));
  }
}

function fixture() {
  const projects = new ProjectRegistry({ store: new MemoryKv<unknown>() });
  projects.upsert({
    id: PROJECT,
    name: "Canonical home",
    description: "Not a project membership grant for the test principal.",
    members: [{ principalId: OWNER, role: "owner" }],
    settings: {},
    createdAt: "2026-07-21T20:00:00.000Z",
    createdBy: OWNER,
  });
  const workspaces = new WorkspaceRegistry({
    projects,
    store: new MemoryKv<unknown>(),
  });
  workspaces.upsert({
    id: WORKSPACE,
    projectId: PROJECT,
    name: "Mounted workspace",
    description: "Visible through a mount, authorized only by an exact grant.",
    status: "active",
    createdAt: "2026-07-21T20:00:00.000Z",
    createdBy: OWNER,
  });
  const personalScopes = new PersonalScopeRegistry({
    store: new MemoryKv<unknown>(),
  });
  const scopes = new ProjectWorkspaceScopeRegistry(
    projects,
    workspaces,
    personalScopes,
  );
  let grantId = 0;
  const grants = new ScopeGrantRegistry({
    scopes,
    store: new MemoryKv<unknown>(),
    now: () => new Date("2026-07-21T20:00:00.000Z"),
    createId: () => `grant-${++grantId}`,
  });
  const threadStore = new MemoryKv<AgentThread>();
  const repository = new AgentThreadRepository({
    threads: threadStore,
    preferences: new MemoryKv<AgentThreadPreference>(),
    defaultPersonaId: "sigil-chat-eve",
    now: () => new Date("2026-07-21T20:00:00.000Z"),
    createId: (() => {
      let id = 0;
      return () => `thread-${++id}`;
    })(),
  });
  const nav = {
    personalProjectId: `personal:${PRINCIPAL}`,
    projects: [projects.get(PROJECT)!],
    workspaces: [{ ...workspaces.get(WORKSPACE)!, mountedProjectIds: [PROJECT] }],
  };
  const service = createThreadBindingService({
    repository,
    registries: { projects, workspaces, personalScopes, scopes, grants },
    loadNav: () => nav,
    resolvePerspective: resolveScopePerspective,
  });
  return {
    grants,
    nav,
    personalScopes,
    repository,
    scopes,
    service,
    threadStore,
  };
}

function grantWorkspace(
  grants: ScopeGrantRegistry,
  actions: Array<"discover" | "read" | "tool"> = ["read"],
) {
  return grants.create({
    actions,
    principalId: PRINCIPAL,
    resourceScope: `workspace:${WORKSPACE}`,
    createdBy: OWNER,
  });
}

describe("agent thread binding service", () => {
  it("treats mounted navigation as display-only until an exact read grant exists", () => {
    const { grants, service } = fixture();

    grantWorkspace(grants, ["discover"]);

    expect(() =>
      service.create(PRINCIPAL, {
        personaId: "sigil-chat-eve",
        workspaceId: WORKSPACE,
      }),
    ).toThrow("EVE_RESOURCE_SCOPE_NOT_AUTHORIZED");

    expect(() =>
      service.create(PRINCIPAL, {
        personaId: "sigil-chat-eve",
        sessionKind: "personal",
        initialPerspective: { focusScopeId: WORKSPACE, viaScopeIds: [PROJECT] },
      }),
    ).toThrow("EVE_RESOURCE_SCOPE_NOT_AUTHORIZED");

    expect(() =>
      service.create(PRINCIPAL, {
        personaId: "sigil-chat-eve",
        sessionKind: "personal",
        additionalContextScopeIds: [WORKSPACE],
      }),
    ).toThrow("EVE_RESOURCE_SCOPE_NOT_AUTHORIZED");

    grantWorkspace(grants);
    const thread = service.create(PRINCIPAL, {
      personaId: "sigil-chat-eve",
      workspaceId: WORKSPACE,
      additionalContextScopeIds: [WORKSPACE],
    });
    expect(thread.executionBinding).toMatchObject({
      homeScopeId: WORKSPACE,
      initialPerspective: { focusScopeId: WORKSPACE },
      additionalContextScopeIds: [WORKSPACE],
    });
  });

  it("opens an exact-granted scope directly when its nav path is undiscoverable", () => {
    const { grants, nav, service } = fixture();
    grantWorkspace(grants);
    nav.projects.length = 0;
    nav.workspaces.length = 0;

    const thread = service.create(PRINCIPAL, {
      personaId: "sigil-chat-eve",
      workspaceId: WORKSPACE,
      initialPerspective: { focusScopeId: WORKSPACE, viaScopeIds: [] },
    });

    expect(thread.executionBinding?.initialPerspective).toEqual({
      focusScopeId: WORKSPACE,
      viaScopeIds: [],
    });
    expect(() =>
      service.create(PRINCIPAL, {
        personaId: "sigil-chat-eve",
        workspaceId: WORKSPACE,
        initialPerspective: {
          focusScopeId: WORKSPACE,
          viaScopeIds: [PROJECT],
        },
      }),
    ).toThrow("initial perspective is not available");
  });

  it("uses the authorized active workspace for existing UI create calls", () => {
    const { grants, repository, service } = fixture();
    grantWorkspace(grants);
    repository.setActiveContainer(PRINCIPAL, {
      perspective: { focusScopeId: WORKSPACE, viaScopeIds: [PROJECT] },
    });

    const thread = service.create(PRINCIPAL, { personaId: "sigil-chat-eve" });

    expect(thread.workspaceId).toBe(WORKSPACE);
    expect(thread.executionBinding?.homeScopeId).toBe(WORKSPACE);
  });

  it("falls back to a materialized personal session and honors explicit personal", () => {
    const { personalScopes, repository, service } = fixture();
    repository.setActiveContainer(PRINCIPAL, {
      perspective: { focusScopeId: WORKSPACE, viaScopeIds: [] },
    });

    const implicit = service.create(PRINCIPAL, { personaId: "sigil-chat-eve" });
    const explicit = service.create(PRINCIPAL, {
      personaId: "sigil-chat-eve",
      sessionKind: "personal",
    });

    expect(implicit.executionBinding?.homeScopeId).toBe(
      `personal-scope:${PRINCIPAL}`,
    );
    expect(explicit.executionBinding?.homeScopeId).toBe(
      `personal-scope:${PRINCIPAL}`,
    );
    expect(personalScopes.getInstallation()?.id).toBe("installation:default");
  });

  it("reauthorizes bound scopes against live grants after revocation", () => {
    const { grants, service } = fixture();
    const grant = grantWorkspace(grants);
    const thread = service.create(PRINCIPAL, {
      personaId: "sigil-chat-eve",
      workspaceId: WORKSPACE,
    });

    expect(service.resolveExecution(PRINCIPAL, thread.id).id).toBe(thread.id);
    grants.revoke(grant.id, OWNER);

    expect(() => service.resolveExecution(PRINCIPAL, thread.id)).toThrow(
      "EVE_RESOURCE_SCOPE_NOT_AUTHORIZED",
    );
    expect(() =>
      service.fork(PRINCIPAL, { sourceThreadId: thread.id }),
    ).toThrow("EVE_RESOURCE_SCOPE_NOT_AUTHORIZED");
  });

  it("creates a bound first-load thread and migrates legacy workspace records", () => {
    const { grants, repository, service, threadStore } = fixture();
    grantWorkspace(grants);
    repository.setActiveContainer(PRINCIPAL, {
      perspective: { focusScopeId: WORKSPACE, viaScopeIds: [] },
    });

    const firstLoad = service.ensureActive(PRINCIPAL);
    expect(firstLoad[0]?.executionBinding?.homeScopeId).toBe(WORKSPACE);

    const legacy = repository.create(PRINCIPAL, {
      personaId: "sigil-chat-eve",
      workspaceId: WORKSPACE,
    });
    const stored = threadStore.get(`thread:${legacy.id}`)!;
    delete stored.executionBinding;
    threadStore.set(`thread:${legacy.id}`, stored);

    const migrated = service.resolveExecution(PRINCIPAL, legacy.id);
    expect(migrated.executionBinding?.homeScopeId).toBe(WORKSPACE);
    expect(migrated.revision).toBe(legacy.revision + 1);
  });

  it("refuses to rehome a revoked legacy workspace thread as personal", () => {
    const { grants, repository, service, threadStore } = fixture();
    const grant = grantWorkspace(grants);
    const legacy = repository.create(PRINCIPAL, {
      personaId: "sigil-chat-eve",
      workspaceId: WORKSPACE,
    });
    const stored = threadStore.get(`thread:${legacy.id}`)!;
    delete stored.executionBinding;
    threadStore.set(`thread:${legacy.id}`, stored);
    grants.revoke(grant.id, OWNER);

    expect(() => service.resolveExecution(PRINCIPAL, legacy.id)).toThrow(
      "EVE_RESOURCE_SCOPE_NOT_AUTHORIZED",
    );
    expect(repository.get(PRINCIPAL, legacy.id)?.executionBinding).toBeUndefined();
  });

  it("migrates legacy unbound records to personal before fork or execution", () => {
    const { repository, service } = fixture();
    const executionLegacy = repository.create(PRINCIPAL, {
      personaId: "sigil-chat-eve",
    });
    const forkLegacy = repository.create(PRINCIPAL, {
      personaId: "sigil-chat-eve",
    });

    const migrated = service.resolveExecution(PRINCIPAL, executionLegacy.id);
    const fork = service.fork(PRINCIPAL, {
      sourceThreadId: forkLegacy.id,
      expectedRevision: forkLegacy.revision,
    });

    expect(migrated.executionBinding?.homeScopeId).toBe(
      `personal-scope:${PRINCIPAL}`,
    );
    expect(fork.executionBinding).toEqual(migrated.executionBinding);
    expect(
      repository.get(PRINCIPAL, forkLegacy.id)?.executionBinding?.homeScopeId,
    ).toBe(`personal-scope:${PRINCIPAL}`);
    expect(() =>
      service.resolveExecution("user-other", executionLegacy.id),
    ).toThrow(
      `Agent thread ${executionLegacy.id} was not found.`,
    );
  });
});
