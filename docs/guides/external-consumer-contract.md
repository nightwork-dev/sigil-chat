# External-consumer contract

This is the release contract for a generated Sigil Chat application consumed outside this repository. The consumer owns tools, context contributors, persistence, and application policy. It consumes released contracts only.

The companion [clean-room fixture](../fixtures/external-consumer/) is the executable proof. It must never gain `workspace:`, `file:`, `@workspace/*`, or Sigil Chat `apps/*` dependencies.

## Current application train

This matrix is derived from the application manifests and lockfile. “Public”
means that the exact version resolves from `https://registry.npmjs.org` without
a workspace link, file dependency, tarball, or private registry.

| Surface                      | Exact application version                                                                                             | Public status  | Consumer evidence                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Eve host process             | `eve@0.25.2`                                                                                                          | Public         | Clean-room fixture install, typecheck, MCP smoke, and independent Eve boot.                                                                                  |
| Web compatibility dependency | `eve@0.24.4`                                                                                                          | Public         | Present through the current web adapter graph; it is not the deployed host version. This split remains a compatibility finding.                              |
| Gonk Core                    | `@gonk/auth`, `context`, `retrieval`, `scope`, `skills`, `store`, `tool-registry`, and `tool-registry-mcp` at `0.3.1` | Public         | The fixture exercises `auth`, `context`, `scope`, `tool-registry`, and `tool-registry-mcp`. Retrieval, skills, and store remain unexercised by this fixture. |
| Gonk Eve host                | `@gonk/eve-host@0.5.1-mem2.6`                                                                                         | **Not public** | Full external application install is blocked until publication.                                                                                              |
| Gonk memory                  | `@gonk/memory@0.5.1-mem2.5`                                                                                           | **Not public** | Full external application install is blocked until publication.                                                                                              |
| Gonk persona                 | `@gonk/persona@0.5.1-mem2.5`                                                                                          | **Not public** | Full external application install is blocked until publication.                                                                                              |
| Gonk MCP adapter             | `@zigil/agent-gonk@0.1.0`                                                                                             | Public         | Fixture mounts and calls authenticated Streamable HTTP MCP.                                                                                                  |
| Eve adapter                  | `@zigil/agent-eve@0.1.5`                                                                                              | **Not public** | Application uses it; the public registry currently exposes only `0.1.0`.                                                                                     |
| Agent surface                | `@zigil/agent-surface@0.1.1`                                                                                          | **Not public** | Application uses it; the public registry currently exposes only `0.1.0`.                                                                                     |
| React adapter                | `@zigil/agent-react@0.1.1`                                                                                            | **Not public** | Application uses it; the public registry currently exposes only `0.1.0`.                                                                                     |
| React Query adapter          | `@zigil/agent-react-query@0.1.1`                                                                                      | **Not public** | Application uses it; the public registry currently exposes only `0.1.0`.                                                                                     |
| Chat application source      | Not an npm package                                                                                                    | Not applicable | Consumer-owned source; npm-distributed Chat application source is unsupported.                                                                               |

The executable fixture therefore proves the strongest honest subset of the
current train: Eve `0.25.2`, the Gonk Core `0.3.1` MCP/context boundary, and
`@zigil/agent-gonk@0.1.0`. It does not substitute older packages for the
unpublished rows and does not claim the full application can yet install from
public npm.

## Supported boundary

- Use `sigil` only as the CLI command surface. The generated application and its Chat source remain consumer-owned source, not npm-installed Sigil Design material.
- Add application-owned tools to its own `ToolRegistry` and mount them with `createAgentWebMcpHandler` from `@zigil/agent-gonk`.
- Add application-owned context through `ContextContributor` from `@gonk/context` and compile it in the application's Eve message path.
- Reach a tool over authenticated Streamable HTTP MCP. The fixture proves `initialize` followed by `tools/call`; it does not import or call a registry implementation directly.

Not supported: importing Sigil Chat's `apps/*`, `packages/*`, generated route tree, `@workspace/*` packages, or its session/auth/persistence policy. The reference checkout is not a starter kit.

## Public release checklist

1. Publish only the exact missing runtime-contract versions shown above. Do
   not publish Sigil Design components or Chat application source as npm
   packages.
2. For each package, add a changeset naming the package, the smallest
   semver-justified bump, and the changed export or behavior.
3. Inspect every `npm pack --dry-run` result: declared exports only; no
   `workspace:`, `link:`, `file:`, local paths, credentials, private fixture
   state, or undeclared runtime dependency.
4. Verify the exact version with `npm view <name>@<version> version
--registry=https://registry.npmjs.org` after publication.
5. Copy this fixture to a new temporary directory outside the monorepo and run
   `pnpm install --ignore-workspace --frozen-lockfile
--registry=https://registry.npmjs.org`, `pnpm verify:contract`,
   `pnpm typecheck`, and `pnpm smoke`.
6. Add the newly public packages to the fixture only when it has a real
   consumer path for them. A successful install of an unused dependency is
   not compatibility evidence.

### Required publish order

Publish the three Gonk host capabilities first: persona and memory before
Eve-host, because the host consumes their contracts. Verify their public
tarballs in a clean install. Then publish the four newer `@zigil` adapter
versions, building each against public dependencies only. `@zigil/agent-gonk`
and the Gonk Core `0.3.1` packages are already public and do not need a
gratuitous republish. Chat application source is never an npm package.

## Current public-registry evidence — 2026-07-20

The fixture lockfile and verification commands use the public npm registry
only. The exact public subset installs without parent-workspace resolution,
passes the static contract and TypeScript checks, completes authenticated MCP
`initialize` plus `tools/call`, compiles the application-owned context
contributor, and boots Eve `0.25.2` independently.

Public-registry lookups for the seven versions listed as “Not public” return
`E404`. That is the current full-train blocker. No private-registry result,
workspace link, local tarball, or older-version substitution is accepted as a
replacement for that missing proof.
