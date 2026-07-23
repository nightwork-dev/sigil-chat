---
name: multi-agent-coordination
description: How agents (Claude Code, pi, codex) coordinate when working this repo concurrently — the shared roadmap, worktrees, model routing, collision rules, verification, and the commit protocol. Read before starting non-trivial work here.
---

# Multi-agent coordination (Sigil Chat)

Multiple agents work this repo at once — Claude Code sessions, dispatched
`pi` workers, and codex. This is the shared protocol so nobody collides,
double-works, or ships unverified changes. Read it before starting
non-trivial work.

## Agent roles (stay in your lane)

- **Strategist — strategic coordination.** Ecosystem-wide product direction
  and what it takes to be self-contained
  and safely deployable. Sets strategy; the top coordinator.
- **Coordinator (tactical agent, Claude Code harness) — tactical coordination + implementation
  within the sigil ecosystem** (sigil-chat + sigil-design). Turns strategy
  into shipped, verified code; orchestrates `pi`/Claude workers; owns the
  commit + integration flow on `dev`.
- **Analysis agent — ecosystem analysis & interplay.** How the layers fit;
  auth/accounts; the path to a safe deployable product. Its job is analysis and
  cross-layer reasoning, not unilateral implementation inside sigil-chat —
  route implementation work back through the roadmap so the tactical agent
  can pick it up, or coordinate explicitly before touching shared files.

Handoff shape: **the strategist sets direction → the tactical agent implements +
verifies → analysis informs both.** Tag each roadmap story with
its `worktree`/owner so the lanes don't collide; don't reach into another
agent's lane without coordinating through the roadmap.

## The shared roadmap IS the coordination surface

- The backlog/roadmap lives in a configurable fs store OUTSIDE any worktree
  (`SIGIL_ROADMAP_DIR`, default `beside the sigil repos (resolved from repo root; override SIGIL_ROADMAP_DIR)`), as one `.md` file per
  story with YAML frontmatter + an index. It is NOT git-tracked and is
  shared across every worktree/branch/agent. Do not put stories in a
  worktree's tracked tree.
- Every story's frontmatter carries `worktree` (which workstream it belongs
  to) and `epic`. Filter to your own worktree/epic — don't act on another
  stream's stories, and don't be confused by them.
- Three ways in, same store: the in-app board (`/_app/roadmap`), the
  `sigil-story-*` MCP tools, or editing the `.md` files directly.
- Claim before you work. When you start a story set its `status`
  (`in-progress`) and `assignee`; when done, `verify`/`shipped`. That's how
  another agent knows not to pick it up.

## Worktrees + branches

- `dev` is the integration/demo branch. Verified work commits to `dev`; the
  human smokes `dev`.
- Each workstream gets its own worktree off `dev`, merged back. Never run
  two agents in the same worktree on overlapping files.
- Tag stories with their `worktree` so cross-worktree agents aren't confused.
- Run `git worktree list` from any checkout to see the live set — it
  reflects reality better than any doc, since worktrees get added/retired as
  workstreams open and close.
- A fresh worktree needs no configuration handoff. Enter it and run `pnpm dev`;
  the launcher synchronizes dependencies, creates that worktree's credentials
  and owner, and assigns one branch-derived Portless prefix to all three apps.
- Never copy or symlink `.env`, `.data`, `apps/agent/.eve`, or generated
  credentials between worktrees. The external roadmap is shared; runtime state
  is deliberately isolated.
- Use the URLs printed by that worktree's readiness summary. Multiple full
  stacks can run concurrently without sharing the primary checkout's names.
- Stop the stack and use `pnpm dev:reset` / the printed `pnpm dev:restore`
  command for state recovery. Do not delete runtime directories by hand.

## Model routing (who does what)

- UI / UX / taste → Claude only (opus/sonnet). Never route UI, interaction,
  copy voice, layout, or aesthetic work to codex/pi/gpt — this applies
  regardless of which harness is coordinating.
- Mechanical plumbing (stores, gonk tools, server fns, schema, docs) → `pi
  gpt-5.6-luna` at high thinking, or codex doing the equivalent mechanical
  pass.
- Coordination / judgment / review → the session model actually doing the
  coordinating.

## Concurrency rules (avoid collisions)

- `pi` is serial: only one `pi` process at a time (its extensions share a
  SQLite db and will hit `database is locked` otherwise). Queue pi work.
- Claude/codex agents run in parallel only on disjoint files.
- Hot shared files — `apps/gonk/src/registry.ts`,
  `apps/web/src/routes/_app.tsx`, `apps/web/src/lib/agent-domain-outcomes.tsx`,
  `packages/agent-contracts/src/client-command.ts` — are owned by the
  orchestrator. Feature agents add their own new files and report the nav
  entry / tool registration for the orchestrator to batch; do not have
  multiple agents edit the same hub file in parallel.
- If two streams genuinely must edit the same file, isolate them in
  separate worktrees and merge.

## Verify against real output (non-negotiable)

- Never trust an exit code, and never pipe a command whose failure must stop
  a chain through `| tail`/`| head`/`| grep` (it masks the real exit).
  Capture to a file and check the real content.
- After writing code, run the real check — typecheck + build + tests — and
  read the output. A subagent's "all passed" report is not evidence; the
  build output is.
- UI changes carry a browser gate: verify in a real browser (or delegate to
  a subagent driving Playwright with a concrete checklist), console clean.

## Commit protocol

- Commit verified work to `dev` as it lands; concern-grouped commits (one
  feature/concern per commit), not a mega-commit.
- One repo per shell call; anchor every call with an absolute `cd`/`git -C`
  (cwd drifts between calls, and this repo has sibling worktrees that are
  easy to confuse with each other).
- Verify green BEFORE committing. A subset of a green tree is only green if
  it's self-contained — commit a package together with the
  `package.json`/`tsconfig` wiring that references it.
- Don't commit another agent's half-finished in-flight files.
- Public commits describe the product concern, not the authoring harness,
  persona, or session. Do not add agent identity or session URL trailers.

## Where things live

- Gonk application tools → `apps/gonk/src/registry.ts` (+ `registry/*.ts`).
  Eve discovers them over MCP via `apps/agent/agent/connections/gonk.ts` —
  never hand-copy tool defs into eve. `exec`-tier tools are denied by
  policy.
- Sigil-first: generalizable UI belongs in sigil-design first (canonical) +
  a `/showcase` example, then carried into sigil-chat as owned source and
  consumed. Don't build app-local what the design system should own.
- `pnpm dev` generates the worktree's Gonk bearer under
  `.data/dev/gonk-mcp-key` and supplies it to every service. Do not copy,
  export, or symlink it during ordinary local development; explicit
  `GONK_MCP_KEY` configuration is a deployment/override concern.
