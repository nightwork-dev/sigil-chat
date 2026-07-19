import { passthrough, ToolRegistry } from "@gonk/tool-registry";

export function createFixtureRegistry() {
  const registry = new ToolRegistry();
  registry.register({
    name: "fixture-echo",
    description:
      "Return the fixture-owned value through the public MCP boundary.",
    approval: "read",
    input: passthrough(),
    handler: async (input) => ({ data: { value: input } }),
  });
  return registry;
}
