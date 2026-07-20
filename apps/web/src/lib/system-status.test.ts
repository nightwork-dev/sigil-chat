import { describe, expect, it } from "vitest";

import { measureService } from "./system-status";

describe("system status measurement", () => {
  it("records successful dependency latency", async () => {
    const times = [100, 124];
    await expect(
      measureService(
        "web",
        "Web",
        () => Promise.resolve(),
        () => times.shift()!,
      ),
    ).resolves.toEqual({
      id: "web",
      label: "Web",
      latencyMs: 24,
      status: "healthy",
    });
  });

  it("fails closed without exposing dependency errors", async () => {
    const times = [100, 110];
    const status = await measureService(
      "eve",
      "Agent runtime",
      () => Promise.reject(new Error("secret path and token")),
      () => times.shift()!,
    );

    expect(status).toEqual({
      id: "eve",
      label: "Agent runtime",
      latencyMs: 10,
      status: "unhealthy",
    });
    expect(JSON.stringify(status)).not.toContain("secret");
  });
});
