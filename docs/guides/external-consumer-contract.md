# External-consumer contract

This is the release contract for a generated Sigil Chat application consumed outside this repository. The consumer owns tools, context contributors, persistence, and application policy. It consumes released contracts only.

The companion [clean-room fixture](../fixtures/external-consumer/) is a dated,
executable boundary proof. It must never gain `workspace:`, `file:`,
`@workspace/*`, or Sigil Chat `apps/*` dependencies.

## Verified fixture train

This matrix records the application train proved by the fixture on 2026-07-20;
it is evidence, not a live projection of the application manifests. “Public”
means that the exact version resolved from `https://registry.npmjs.org` without
a workspace link, file dependency, tarball, or private registry at that proof
point.

| Surface                      | Exact application version                                                                                             | Status on 2026-07-20 | Consumer evidence                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Eve host process             | `eve@0.25.2`                                                                                                          | Public         | Clean-room fixture install, typecheck, MCP smoke, and independent Eve boot.                                                                                  |
| Web compatibility dependency | `eve@0.24.4`                                                                                                          | Public         | Present through the current web adapter graph; it is not the deployed host version. This split remains a compatibility finding.                              |
| Gonk Core                    | `@gonk/auth`, `context`, `retrieval`, `scope`, `skills`, `store`, `tool-registry`, and `tool-registry-mcp` at `0.3.1` | Public         | The fixture exercises `auth`, `context`, `scope`, `tool-registry`, and `tool-registry-mcp`. Retrieval, skills, and store remain unexercised by this fixture. |
| Gonk Eve host                | `@gonk/eve-host@0.5.1-mem2.6`                                                                                         | **Not public** | Full external application installation was blocked pending publication.                                                                                      |
| Gonk memory                  | `@gonk/memory@0.5.1-mem2.5`                                                                                           | **Not public** | Full external application installation was blocked pending publication.                                                                                      |
| Gonk persona                 | `@gonk/persona@0.5.1-mem2.5`                                                                                          | **Not public** | Full external application installation was blocked pending publication.                                                                                      |
| Gonk MCP adapter             | `@zigil/agent-gonk@0.1.0`                                                                                             | Public         | Fixture mounts and calls authenticated Streamable HTTP MCP.                                                                                                  |
| Eve adapter                  | `@zigil/agent-eve@0.1.5`                                                                                              | **Not public** | The application used it; the public registry exposed only `0.1.0` at the proof point.                                                                        |
| Agent surface                | `@zigil/agent-surface@0.1.1`                                                                                          | **Not public** | The application used it; the public registry exposed only `0.1.0` at the proof point.                                                                        |
| React adapter                | `@zigil/agent-react@0.1.1`                                                                                            | **Not public** | The application used it; the public registry exposed only `0.1.0` at the proof point.                                                                        |
| React Query adapter          | `@zigil/agent-react-query@0.1.1`                                                                                      | **Not public** | The application used it; the public registry exposed only `0.1.0` at the proof point.                                                                        |
| Chat application source      | Not an npm package                                                                                                    | Not applicable | Consumer-owned source; npm-distributed Chat application source is unsupported.                                                                               |

The executable fixture therefore proves the strongest honest subset of that
train: Eve `0.25.2`, the Gonk Core `0.3.1` MCP/context boundary, and
`@zigil/agent-gonk@0.1.0`. It did not substitute older packages for the
unpublished rows or claim that the full application could install from public
npm at that proof point.

## Current application delta — 2026-07-22

The application now resolves Eve `0.27.0` in both the web and host apps and no
longer consumes `@zigil/agent-eve`. The retained Gonk host packages are `0.6.0`,
and the retained React adapter is `@zigil/agent-react@0.1.4`; those exact
versions resolve from the public registry. This does not retroactively upgrade
the fixture evidence. In particular, Sigil Chat still carries an application
patch that creates a fresh MCP client with request-scoped headers per tool
invocation, so an unpatched standalone Eve install is not equivalent evidence
for Sigil Chat's delegation boundary.

## Supported boundary

- Use `sigil` only as the CLI command surface. The generated application and its Chat source remain consumer-owned source, not npm-installed Sigil Design material.
- Add application-owned tools to its own `ToolRegistry` and mount them with `createAgentWebMcpHandler` from `@zigil/agent-gonk`.
- Add application-owned context through `ContextContributor` from `@gonk/context` and compile it in the application's Eve message path.
- Reach a tool over authenticated Streamable HTTP MCP. The fixture proves `initialize` followed by `tools/call`; it does not import or call a registry implementation directly.

Not supported: importing Sigil Chat's `apps/*`, `packages/*`, generated route tree, `@workspace/*` packages, or its session/auth/persistence policy. The reference checkout is not a starter kit.

## Fixture refresh checklist

1. Update the fixture only when it gains a real consumer path for the package
   or version being added. A successful install of an unused dependency is not
   compatibility evidence.
2. Inspect every newly published package with `npm pack --dry-run`: declared
   exports only; no
   `workspace:`, `link:`, `file:`, local paths, credentials, private fixture
   state, or undeclared runtime dependency.
3. Verify every exact version with `npm view <name>@<version> version
   --registry=https://registry.npmjs.org`.
4. Copy this fixture to a new temporary directory outside the monorepo and run
   `pnpm install --ignore-workspace --frozen-lockfile
   --registry=https://registry.npmjs.org`, `pnpm verify:contract`,
   `pnpm typecheck`, and `pnpm smoke`.
5. Record the proof date and keep the compatibility manifest explicitly
   historical rather than presenting it as a live application dependency map.

### Historical publication order

The 2026-07-20 release ordered persona and memory before Eve-host because the
host consumed their contracts, then published the newer `@zigil` adapters
against public dependencies. That sequence is complete and is not an
instruction to republish those versions. Chat application source remains
consumer-owned source rather than an npm package.

## Recorded public-registry evidence — 2026-07-20

The fixture lockfile and verification commands use the public npm registry
only. The exact public subset installs without parent-workspace resolution,
passes the static contract and TypeScript checks, completes authenticated MCP
`initialize` plus `tools/call`, compiles the application-owned context
contributor, and boots Eve `0.25.2` independently.

Public-registry lookups for the seven versions listed as “Not public” returned
`E404` at that proof point. Later publication does not rewrite this record; the
current application delta above identifies the newer versions verified on
2026-07-22. No private-registry result, workspace link, local tarball, or
older-version substitution counts as public-registry proof.
