# Development without ceremony

The development contract is one command:

```bash
pnpm dev
```

A fresh checkout or linked worktree does not need `pnpm install`, a copied
`.env`, manual migrations, a password reset, or separate service terminals.
The launcher:

- checks Node, Portless, the local Codex login, and the package manager;
- synchronizes the frozen install;
- creates worktree-local data and service credentials;
- applies idempotent auth migrations and seeds the development owner;
- starts Web, Eve, and Gonk with one branch-derived Portless prefix;
- proves the authenticated Web → Eve → Gonk path; and
- prints and opens a private single-use owner sign-in URL.

Use the URLs in that readiness summary. The unprefixed
`sigil-chat.localhost` URLs belong to the primary checkout; linked worktrees
receive their own names automatically.

## Prerequisites

Install these once per machine:

- Node 24;
- [Portless](https://www.npmjs.com/package/portless), available as the
  `portless` command; and
- a local Codex session created by `codex login`.

Everything else is repository-owned or prepared by `pnpm dev`. When startup
fails, read the final `Try:` line first. Set `SIGIL_DEV_DEBUG=1` only when the
normal diagnostic is insufficient.

## The ordinary edit loop

1. Run `pnpm dev` and wait for `Sigil Chat ready`.
2. Use the opened owner session or the printed private sign-in URL.
3. Make the change and run the narrowest relevant test while iterating.
4. Run `pnpm typecheck` after cross-package TypeScript changes.
5. Run `pnpm verify` before integration. Add `pnpm build` when the change
   affects production bundling or deployment.
6. Exercise the changed behavior in the real workspace, using the URL printed
   by this worktree's launcher.

`pnpm verify` runs lint, typecheck, the development-script tests, and all
package tests. A browser-facing change is not proven by those checks alone.

## Worktrees are independent development instances

Create a branch worktree from `dev`, enter it, and run the same command:

```bash
git worktree add ../sigil-chat-my-feature -b codex/my-feature dev
cd ../sigil-chat-my-feature
pnpm dev
```

Do not symlink another checkout's `.env`, `.data`, `apps/agent/.eve`, owner
credentials, or Gonk bearer. Each worktree owns those disposable values and
can run a complete stack alongside the others. The external roadmap repository
is intentionally shared across worktrees; checked-in application behavior is
intentionally shared through Git.

The readiness summary reports the current branch and warns when `dev` is not
an ancestor. That warning is source-control topology, not corrupt runtime
state: fix or recreate the branch rather than resetting the app.

## Start over safely

Stop `pnpm dev`, then run:

```bash
pnpm dev:reset
pnpm dev
```

Reset quarantines only this worktree's documented disposable state under the
Git common directory and prints the exact restore command. It does not touch
`.env`, the external roadmap, agent tooling state, or another worktree.

To recover the previous instance, stop the new stack, reset its newly created
state if necessary, and run the command printed by reset:

```bash
pnpm dev:restore <backup-path-or-id>
pnpm dev
```

Do not use `rm -rf .data apps/agent/.eve` as the normal recovery path. It loses
the backup receipt and makes it easier to delete the wrong worktree's state.

## Configuration boundary

- Edit `fixtures/application/sigil-chat.yaml` for reviewed product behavior:
  branding, model choice, registration policy, and image defaults.
- Use environment variables for secrets, deployment identity, external
  services, or unusual network/storage topology.
- Ordinary local development needs no environment file.

See [Configuration without the scavenger hunt](configuration.md) for the full
deployment surface.
