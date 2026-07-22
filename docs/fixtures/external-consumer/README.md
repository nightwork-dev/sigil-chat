# External-consumer fixture

This standalone generated-app-shaped consumer owns one `fixture-echo` tool and one `fixture-resource` context contributor. It uses released packages only; it does not import `@workspace/*`, Sigil Chat `apps/*`, or route output.

The fixture pins the publicly available subset of the application train that
was verified on 2026-07-20 in `compatibility-train.json`. It is a dated proof,
not a live dependency projection. Install it from the public npm registry,
outside the parent pnpm workspace:

```bash
pnpm install --ignore-workspace --frozen-lockfile \
  --registry=https://registry.npmjs.org
pnpm verify:contract
pnpm typecheck
pnpm smoke
pnpm dev
```

`pnpm smoke` starts the fixture Gonk server and proves MCP `initialize` plus `tools/call`, then compiles the fixture resource provider. `pnpm dev` starts the Eve host and Gonk server for an agent boot check.

This is deliberately a boundary proof, not a claim that the entire Sigil Chat
application train is public. The compatibility manifest also records the exact
memory, persona, Eve-host, and React adapter versions that were used by the
application at the proof point, including the versions that were not public
then.
