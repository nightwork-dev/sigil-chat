import { describe, expect, it } from "vitest"

import {
  COORDINATOR_CONTEXT_ENV_VAR,
  CoordinatorContextError,
  parseCoordinatorContext,
  serializeCoordinatorContext,
  type CoordinatorBoundContext,
} from "./context"

const CONTEXT: CoordinatorBoundContext = {
  applicationThreadId: "thread-1",
  principalId: "user-1",
  personaId: "persona-1",
  homeScopeId: "atlas",
  initialPerspective: { focusScopeId: "atlas", viaScopeIds: ["via-1"] },
  additionalContextScopeIds: ["ctx-1"],
  eveSessionId: "eve-session-1",
  authorityResourceScope: "workspace:atlas",
  capability: "eve-delegation",
  eveOrigin: "http://sigil-chat-agent.localhost:1355",
  bindingSecret: "binding-secret",
  grants: [],
  bearer: "a.bearer.jwt",
  allowLocalDevAuth: true,
}

describe("serialize/parse round-trip", () => {
  it("carries the full bound context through one env var", () => {
    const env = serializeCoordinatorContext(CONTEXT)
    expect(Object.keys(env)).toEqual([COORDINATOR_CONTEXT_ENV_VAR])
    expect(parseCoordinatorContext(env)).toEqual(CONTEXT)
  })

  it("omits optional fields cleanly when absent", () => {
    const { eveSessionId, bearer, ...minimal } = CONTEXT
    void eveSessionId
    void bearer
    const parsed = parseCoordinatorContext(
      serializeCoordinatorContext({ ...minimal, allowLocalDevAuth: false }),
    )
    expect(parsed.eveSessionId).toBeUndefined()
    expect(parsed.bearer).toBeUndefined()
    expect(parsed.allowLocalDevAuth).toBe(false)
  })
})

describe("fails closed", () => {
  it("throws when the env var is missing", () => {
    expect(() => parseCoordinatorContext({})).toThrow(CoordinatorContextError)
  })

  it("throws on malformed JSON", () => {
    expect(() =>
      parseCoordinatorContext({ [COORDINATOR_CONTEXT_ENV_VAR]: "{not json" }),
    ).toThrow(CoordinatorContextError)
  })

  it.each([
    "applicationThreadId",
    "principalId",
    "personaId",
    "homeScopeId",
    "authorityResourceScope",
    "capability",
    "eveOrigin",
    "bindingSecret",
  ])("throws when required field %j is missing", (field) => {
    const partial: Record<string, unknown> = { ...CONTEXT }
    delete partial[field]
    expect(() =>
      parseCoordinatorContext({
        [COORDINATOR_CONTEXT_ENV_VAR]: JSON.stringify(partial),
      }),
    ).toThrow(CoordinatorContextError)
  })

  it("rejects a non-array grants field", () => {
    expect(() =>
      parseCoordinatorContext({
        [COORDINATOR_CONTEXT_ENV_VAR]: JSON.stringify({
          ...CONTEXT,
          grants: "not-an-array",
        }),
      }),
    ).toThrow(CoordinatorContextError)
  })

  it("rejects a grant missing required fields", () => {
    expect(() =>
      parseCoordinatorContext({
        [COORDINATOR_CONTEXT_ENV_VAR]: JSON.stringify({
          ...CONTEXT,
          grants: [{ id: "g" }],
        }),
      }),
    ).toThrow(CoordinatorContextError)
  })

  it("rejects a malformed perspective", () => {
    expect(() =>
      parseCoordinatorContext({
        [COORDINATOR_CONTEXT_ENV_VAR]: JSON.stringify({
          ...CONTEXT,
          initialPerspective: { viaScopeIds: [] },
        }),
      }),
    ).toThrow(CoordinatorContextError)
  })
})
