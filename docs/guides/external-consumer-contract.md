# External-consumer contract

This is the release contract for a generated Sigil Chat application consumed outside this repository. The consumer owns tools, context contributors, persistence, and application policy. It consumes released contracts only.

The companion [clean-room fixture](../fixtures/external-consumer/) is the executable proof. It must never gain `workspace:`, `file:`, `@workspace/*`, or Sigil Chat `apps/*` dependencies.

## Supported train

| Surface                  | Exact version                                                                                                                                               | Compatibility status                                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sigil CLI command        | `sigil@0.1.0`                                                                                                                                                    | Local `npx` command surface only. It does not make Sigil Design component or application source an npm dependency.                                                     |
| Chat application source  | Not an npm package                                                                                                                                               | The Chat overlay is source-owned application material; npm-distributed overlays are unsupported. A separate source-generation proof is required.                       |
| Eve host                 | `eve@0.24.4`                                                                                                                                                | **Verified:** fixture installs and boots this host.                                                                                                                    |
| Eve adapter              | `@zigil/agent-eve@0.1.0`                                                                                                                                    | Declared pair with `@zigil/agent-surface@0.1.0`; not exercised by the headless fixture.                                                                                |
| Agent surface            | `@zigil/agent-surface@0.1.0`                                                                                                                                | Declared neutral session/catalog contract; no fixture UI consumer.                                                                                                     |
| React adapter            | `@zigil/agent-react@0.1.0`                                                                                                                                  | Declared React `19` peer train; no fixture UI consumer.                                                                                                                |
| React Query adapter      | `@zigil/agent-react-query@0.1.0`                                                                                                                            | Declared React `19` + React Query `5` peer train; no fixture UI consumer.                                                                                              |
| Gonk MCP adapter         | `@zigil/agent-gonk@0.1.0`                                                                                                                                   | **Verified:** fixture mounts and calls the authenticated MCP boundary.                                                                                                 |
| Gonk contracts           | `@gonk/auth`, `@gonk/context`, `@gonk/retrieval`, `@gonk/scope`, `@gonk/skills`, `@gonk/store`, `@gonk/tool-registry`, `@gonk/tool-registry-mcp` at `0.3.1` | **Verified subset:** fixture installs `auth`, `context`, `scope`, `tool-registry`, and `tool-registry-mcp`; remaining declared packages need their own consumer proof. |

The reference app currently resolves Eve `0.24.4`, `@zigil/agent-gonk@0.1.0`, and the Gonk `0.3.1` train. The matrix records the intended release train; its status column distinguishes the proven headless boundary from unexercised UI and source-generation rows.

## Supported boundary

- Use `sigil` only as the CLI command surface. The generated application and its Chat source remain consumer-owned source, not npm-installed Sigil Design material.
- Add application-owned tools to its own `ToolRegistry` and mount them with `createAgentWebMcpHandler` from `@zigil/agent-gonk`.
- Add application-owned context through `ContextContributor` from `@gonk/context` and compile it in the application's Eve message path.
- Reach a tool over authenticated Streamable HTTP MCP. The fixture proves `initialize` followed by `tools/call`; it does not import or call a registry implementation directly.

Not supported: importing Sigil Chat's `apps/*`, `packages/*`, generated route tree, `@workspace/*` packages, or its session/auth/persistence policy. The reference checkout is not a starter kit.

## Release checklist

Use **one** local registry: `http://localhost:4873`. Do not start a second Verdaccio process or substitute a different local registry while validating this train.

1. Confirm the designated registry is reachable: `curl --fail http://localhost:4873/-/ping`.
2. Publish only the exact runtime-contract package set. Do not publish or install Sigil Design components or Chat application source as npm packages. No `workspace:`, `link:`, `file:`, prerelease tag, or caret range is release evidence.
3. For each changed public package, add a changeset naming the package, smallest semver-justified bump, and changed export. Breaking export/type/behavior changes are major; additive compatible exports minor; compatible repairs patch.
4. Inspect each tarball before publication: declared exports only; no workspace links or private fixture state.
5. From a new temporary directory, install the fixture with `npm_config_registry=http://localhost:4873`; run `pnpm install`, inspect the lockfile for the exact resolved train, then run `pnpm verify:contract`, `pnpm smoke`, and typecheck. Capture unabridged output and exit codes. Treat generated-app source proof as a separate source-generation concern, not npm-install evidence.
6. Record `npm view <package> version --registry http://localhost:4873`, the generated lockfile, and clean-room results in the release report.

### Required publish order

The Gonk train comes first. Publish and verify the complete `@gonk/*@0.3.1`
train from the `7245017` release input, then install that train before building
or publishing `@zigil/agent-gonk@0.1.0`: its declaration build imports
`@gonk/tool-registry/security`. Next publish the exact `@zigil/agent-surface`,
`agent-eve`, `agent-react`, and `agent-react-query` `0.1.0` packages, then
`@zigil/agent-gonk@0.1.0`. `sigil@0.1.0` is a local `npx` command surface;
it is not a source-distribution channel. Chat application source is never an
npm package.

## Current release evidence — 2026-07-19

The designated launchd-managed registry is live at `localhost:4873` and owns
the only listener on port 4873. A fresh copied fixture installed the exact
pinned dependencies from it, passed `verify:contract` and `typecheck`, and
completed the authenticated MCP `initialize` plus `tools/call` smoke. The
initial unavailable-registry result is superseded by this captured proof.

No replacement registry was started and no workspace-linked substitute was
used. The copied fixture's Eve host also booted successfully at
`http://127.0.0.1:2000/` with its authored instructions.

`sigil@0.1.0` was published to the designated local registry as the CLI command
surface. The attempted `@sigil-design/chat-overlay@0.1.0` and `0.1.1` releases
were removed: Chat application source must not be npm-installed from Sigil
Design. Do not reintroduce that package as a release target.
