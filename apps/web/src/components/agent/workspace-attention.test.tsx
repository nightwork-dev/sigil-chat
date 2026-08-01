// @vitest-environment jsdom

import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { AttentionContext } from "@zigil/agent/react"
import {
  useAttention,
  usePublishWorkspaceAttention,
  usePublishWorkspaceResourceScope,
  useWorkspaceResourceScope,
  WorkspaceAttentionProvider,
} from "./workspace-attention"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>()
  return {
    ...actual,
    useRouterState: ({
      select,
    }: {
      select: (state: { location: { pathname: string } }) => unknown
    }) => select({ location: { pathname: "/route-only" } }),
  }
})

describe("WorkspaceAttentionProvider", () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    container = null
    root = null
  })

  function Publisher({
    attention,
    scope,
  }: {
    attention: AttentionContext
    scope: string | null
  }) {
    usePublishWorkspaceAttention(attention)
    usePublishWorkspaceResourceScope(scope)
    return null
  }

  function Probe({
    onRead,
  }: {
    onRead: (value: {
      attention: AttentionContext | null
      scope: string | null
    }) => void
  }) {
    onRead({
      attention: useAttention(),
      scope: useWorkspaceResourceScope(),
    })
    return null
  }

  function render(children: ReactNode) {
    act(() => {
      if (!root) {
        container = document.createElement("div")
        document.body.appendChild(container)
        root = createRoot(container)
      }
      root.render(children)
    })
  }

  it("publishes workspace context and clears it back to route-only on unmount", () => {
    const readings: Array<{
      attention: AttentionContext | null
      scope: string | null
    }> = []
    const attention: AttentionContext = {
      application: "sigil-chat",
      route: "/review",
      workspace: { kind: "review", id: "draft", label: "Draft" },
    }

    render(
      <WorkspaceAttentionProvider>
        <Publisher attention={attention} scope="project:review" />
        <Probe onRead={(value) => readings.push(value)} />
      </WorkspaceAttentionProvider>,
    )

    expect(readings.at(-1)).toEqual({
      attention,
      scope: "project:review",
    })

    render(
      <WorkspaceAttentionProvider>
        <Probe onRead={(value) => readings.push(value)} />
      </WorkspaceAttentionProvider>,
    )

    expect(readings.at(-1)).toEqual({
      attention: {
        application: "sigil-chat",
        route: "/route-only",
      },
      scope: null,
    })
  })
})
