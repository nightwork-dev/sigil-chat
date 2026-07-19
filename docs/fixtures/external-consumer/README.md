# External-consumer fixture

This standalone generated-app-shaped consumer owns one `fixture-echo` tool and one `fixture-resource` context contributor. It uses released packages only; it does not import `@workspace/*`, Sigil Chat `apps/*`, or route output.

After the exact train is published to the designated registry:

```bash
export npm_config_registry=http://localhost:4873
pnpm install --frozen-lockfile
pnpm verify:contract
pnpm smoke
pnpm dev
```

`pnpm smoke` starts the fixture Gonk server and proves MCP `initialize` plus `tools/call`, then compiles the fixture resource provider. `pnpm dev` starts the Eve host and Gonk server for an agent boot check.
