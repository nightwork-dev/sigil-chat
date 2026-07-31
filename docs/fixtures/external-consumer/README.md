# External-consumer fixture

This standalone generated-app-shaped consumer owns one `fixture-echo` tool and one `fixture-resource` context contributor. It mounts the Gonk MCP projection directly with `@gonk/tool-registry-mcp`, uses released packages only, and does not import `@workspace/*`, Sigil Chat `apps/*`, or route output.

The fixture pins the current private Gonk Core MCP train in
`compatibility-train.json`. Start local Verdaccio with the pinned Gonk packages,
then install outside the parent pnpm workspace:

```bash
pnpm install --ignore-workspace --frozen-lockfile \
  --config.@gonk:registry=http://localhost:4873
pnpm verify:contract
pnpm typecheck
pnpm smoke
pnpm dev
```

`pnpm smoke` starts the fixture Gonk server and proves MCP `initialize` plus `tools/call`, then compiles the fixture resource provider. `pnpm dev` starts the Eve host and Gonk server for an agent boot check.

This is deliberately a boundary proof, not a public-distribution claim. The
compatibility manifest also records the exact memory, persona, Eve-host, and
agent versions used by the application. Public distribution remains deferred.
