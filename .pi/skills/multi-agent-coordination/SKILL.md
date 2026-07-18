---
name: multi-agent-coordination
description: How agents (Claude Code, pi, codex) coordinate when working this repo concurrently — the shared roadmap, worktrees, model routing, collision rules, verification, and the commit protocol. Read before starting non-trivial work here.
---

# Multi-agent coordination (Sigil Chat) — hard rules

Multiple agents work this repo at once — Claude Code sessions, dispatched
`pi` workers, and codex. This is the checklist so we don't collide,
double-work, or ship unverified changes. Read it before starting non-trivial
work.

## RULE 0: Stay in your lane

- [ ] **Fable** — strategic coordination only. Ecosystem-wide (gonk + eve +
      sigil + deadletters): product direction, self-containment, safe
      deployability. Does NOT implement here.
- [ ] **Garnet (tactical agent, Claude Code harness)** — tactical coordination +
      implementation inside the sigil ecosystem (sigil-chat + sigil-design).
      Turns strategy into shipped, verified code; orchestrates `pi`/Claude
      workers; owns the commit + integration flow on `dev`.
- [ ] **Codex** — ecosystem analysis & interplay (layers, auth/accounts, path
      to safe deployable product). Being partly handed to Fable.
- [ ] Handoff shape is fixed: **Fable sets direction → tactical agent
      implements + verifies → codex/Fable analysis informs both.** Do not
      reach into another agent's lane without coordinating through the
      roadmap first.

## RULE 0: Re-read the live direction doc after EVERY completed task

- [ ] The strategy is LIVE at
      `/Users/dr/Dev/platform/ecosystem/specs/fable-direction-20260718.md`.
      After completing each task: check its mtime; if changed since your
      last read, re-read it BEFORE starting the next task. Never start a
      task on stale direction.
- [ ] Every dispatch brief for a multi-task worker MUST include this rule.

## RULE 1: The shared roadmap is the ONLY coordination surface

- [ ] The backlog lives in a **fs store OUTSIDE any worktree** —
      `SIGIL_ROADMAP_DIR`, default `beside the sigil repos (resolved from repo root; override SIGIL_ROADMAP_DIR)`. One `.md` file per
      story + an index. **NOT git-tracked. Shared across every
      worktree/branch/agent.** Never put stories in a worktree's tracked
      tree.
- [ ] Every story's frontmatter carries `worktree` and `epic`. **Filter to
      your own worktree/epic.** Don't act on another stream's stories.
- [ ] Three equivalent entry points to the same store: the in-app board
      (`/_app/roadmap`), the `sigil-story-*` MCP tools, editing the `.md`
      files directly. Pick any — they're the same data.
- [ ] **Claim before you work.** Set `status: in-progress` + `assignee`
      before starting. Set `verify`/`shipped` when done. If you skip this,
      another agent WILL pick up the same story.

## RULE 2: Worktrees + branches

- [ ] `dev` is the integration/demo branch. Verified work commits to `dev`;
      the human smokes `dev`.
- [ ] Each workstream gets its OWN worktree off `dev`, merged back. NEVER run
      two agents in the same worktree on overlapping files.
- [ ] Tag stories with their `worktree` field so cross-worktree agents don't
      get confused reading each other's in-flight state.

## RULE 3: Model routing — do not cross these lines

- [ ] **UI / UX / taste → Claude ONLY** (opus/sonnet). NEVER route UI,
      interaction, copy voice, layout, or aesthetic work to codex/pi/gpt.
- [ ] **Mechanical plumbing** (stores, gonk tools, server fns, schema, docs)
      → `pi gpt-5.6-luna` at high thinking.
- [ ] **Coordination / judgment / review** → the session model (whichever
      agent is coordinating).

## RULE 4: Concurrency — avoid collisions

- [ ] **`pi` is SERIAL.** Only ONE `pi` process at a time — its extensions
      share a SQLite db and will throw `database is locked` otherwise. Queue
      pi work; do not fan out multiple concurrent `pi` invocations.
- [ ] Claude/codex agents may run in parallel ONLY on disjoint files.
- [ ] **Hot shared files are owned by the orchestrator — do not let N
      agents edit these in parallel:**
      - `apps/gonk/src/registry.ts`
      - `apps/web/src/routes/_app.tsx`
      - `apps/web/src/lib/agent-domain-outcomes.tsx`
      - `packages/agent-contracts/src/client-command.ts`
      Feature agents add their OWN new files and report the nav entry / tool
      registration back to the orchestrator, who batches the hub-file edit.
- [ ] If two streams genuinely must edit the same file, isolate them in
      separate worktrees and merge — do not let both edit it live.

## RULE 5: Verify against real output — non-negotiable

- [ ] Never trust an exit code alone.
- [ ] Never pipe a command whose failure must stop a chain through
      `| tail`/`| head`/`| grep` — it masks the real exit code. Capture to a
      file, then check.
- [ ] After writing code: run the real check — typecheck + build + tests —
      and READ the output. A green subagent report is not evidence; the
      build is.
- [ ] UI changes carry a **browser gate**: verify in a real browser, or
      delegate to a Sonnet subagent driving Playwright with a concrete
      checklist. Never drive Playwright directly from the orchestrating
      session. Console must be clean.

## RULE 6: Commit protocol

- [ ] Commit verified work to `dev` as it lands. **Concern-grouped commits**
      — one feature/concern per commit, never a mega-commit.
- [ ] **EXTRACTION VERDICT gates the merge.** Any story/branch touching
      components/hooks/presentation must state its registry-loop verdict:
      `consumed` / `extracted` / `candidate:<X#>` (X-story must exist) /
      `app-domain` (+ why). Missing verdict = orchestrator bounces it.
      Dispatch briefs for UI-touching work include this requirement and
      demand the verdict in the worker's report.
- [ ] **One repo per bash call.** Anchor every call with an absolute
      `cd`/`git -C` — cwd drifts between calls.
- [ ] **Verify green BEFORE committing.** A subset of a green tree is only
      green if self-contained — commit a package together with the
      `package.json`/`tsconfig` wiring that references it.
- [ ] Do NOT commit another agent's half-finished in-flight files.
- [ ] Every commit carries trailers:
      ```
      Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
      Claude-Session: <session url>
      ```

## RULE 7: Where things live

- [ ] **Gonk application tools** → `apps/gonk/src/registry.ts` (+
      `registry/*.ts`). Eve discovers them over MCP via
      `apps/agent/agent/connections/gonk.ts` — NEVER hand-copy tool defs into
      eve. `exec`-tier tools are denied by policy (see the
      `adding-gonk-tools` skill).
- [ ] **Sigil-first = the registry loop, enforced:** consume-first check
      before authoring (grep `packages/ui` → check sigil-design `/showcase`
      + registry → install, don't re-author) + an extraction verdict before
      any UI-touching story closes. Full contract in `building-in-sigil-chat`
      RULE 0; verdict is checked at merge (RULE 6).
- [ ] **`GONK_MCP_KEY`** must match on the gonk + agent processes; it lives
      in the root `.env` (single source, loaded by gonk + web; agent
      symlink). See the `adding-gonk-tools` skill for the full failure mode.
