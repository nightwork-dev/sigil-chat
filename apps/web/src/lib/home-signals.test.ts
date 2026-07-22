import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"

import { homeSignalKeys, invalidateHomeSignals } from "./home-signals"

describe("home signal cache", () => {
  it("invalidates every scoped feed for the current principal", async () => {
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")

    await invalidateHomeSignals(queryClient, "principal-1")

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: homeSignalKeys.all("principal-1"),
    })
  })
})
