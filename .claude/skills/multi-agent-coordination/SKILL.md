---
name: multi-agent-coordination
description: How agents (Claude Code, pi, codex) coordinate when working this repo concurrently — the shared roadmap, worktrees, model routing, collision rules, verification, and the commit protocol. Read before starting non-trivial work here.
---

# Multi-agent coordination (Sigil Chat)

Multiple agents work this repo at once — Claude Code sessions, dispatched `pi`
workers, and codex. This is the shared protocol so we don't collide, double-work,
or ship unverified changes. Read it before starting non-trivial work.

## Agent roles (stay in your lane)

Identify agents by **name + role, not harness** — several of us run in the same
harness (Claude Code), so "Claude Code" names nothing.

- **Strategist — strategic coordination.** Ecosystem-wide product direction,
  and what it takes to be self-contained and
  safely deployable. Sets strategy; the top coordinator. (Runs in Claude Code.)
- **Coordinator — tactical coordination + implementation within the sigil ecosystem**
  (sigil-chat + sigil-design). Turns strategy into shipped, verified code;
  orchestrates `pi`/Claude workers; owns the commit + integration flow on `dev`.
  (Runs in Claude Code — same harness as Strategist, different role + identity.)
- **Analysis agent — ecosystem analysis & interplay.** How the layers fit;
  auth/accounts and the path to a safe deployable product.
- **pi workers** — dispatched, ephemeral mechanical execution (not a peer).

**Re-read the current roadmap and repository instructions after every completed
task.** Finishing work against stale direction wastes it. Include this
instruction in every dispatch brief for multi-task workers.

Handoff shape: **the strategist sets direction → the coordinator implements +
verifies → analysis informs both.** Tag each roadmap story with its
`worktree`/owner so the lanes don't collide; don't reach into another agent's
lane without coordinating through the roadmap.

## The shared roadmap IS the coordination surface

- The backlog/roadmap lives in a **configurable fs store OUTSIDE any worktree**
  (env `SIGIL_ROADMAP_DIR`; default: **co-located beside the sigil repos** — a
  `sigil-roadmap/` dir resolved from the repo root, outside every worktree), one `.md` file per
  story with YAML frontmatter + an index. It is **NOT git-tracked** and is
  **shared across every worktree/branch/agent**. Do not put stories in a
  worktree's tracked tree.
- **The roadmap store is its OWN local git repo** (`SIGIL_ROADMAP_DIR` is
  `git init`'d on first use). The markdown adapter **commits on each mutation**,
  so the roadmap has history and is restorable if a write breaks it. It's the one
  thing we deliberately preserve — session/agent/`.data` state is disposable, the
  roadmap is not. Independent of every sigil-chat branch (separate git timeline).
- Every story's frontmatter carries `worktree` (which workstream it belongs to)
  and `epic`. **Filter to your own worktree/epic** — don't act on another
  stream's stories, and don't be confused by them.
- Three ways in, same store: the in-app board (`/_app/roadmap`), the
  `sigil-story-*` MCP tools, or editing the `.md` files directly.
- **Claim before you work.** When you start a story set its `status`
  (`in-progress`) and `assignee`; when done, `verify`/`shipped`. That's how
  another agent knows not to pick it up.

## What belongs where (docs + coordination artifacts)

Getting this wrong scatters coordination material into product branches or
bespoke folders — both anti-patterns. Four tiers:

- **Product code + shipped docs** → the repo, on `dev` (tracked). Features and
  the `docs/` guides/specs that ship with the product.
- **Repo-internal working notes** → a gitignored local notes directory.
- **The roadmap** → the external, git-versioned roadmap store (`SIGIL_ROADMAP_DIR`),
  co-located, its own repo, shared across every worktree/agent. NOT in any
  product repo.
- **Ecosystem-level coordination / handoff / strategy** — agent briefs,
  handoffs, and cross-agent notes belong in an untracked workspace-level notes
  directory.
- **NEVER** put roadmap/coordination/handoff artifacts in a product's `dev` tree,
  and **NEVER invent a bespoke ad-hoc directory** — use the established homes
  above. (If you catch yourself `mkdir`-ing a new coordination folder, stop.)
- **Naming convention:** local-only files/dirs are named `*.local` / `*.local.*`
  (e.g. `notes.local`, `foo.local.md`, `.env.local`) and are gitignored by that
  pattern in **every** repo — EXCEPT repos that are themselves local-only (the
  roadmap store), which track everything. Deliberately-tracked exceptions (e.g.
  CLI test fixtures using `.local` names) get an explicit `!` negation.

## Worktrees + branches

- **`dev` is the integration/demo branch.** Verified work commits to `dev`; the
  human smokes `dev`.
- **Parallel work gets its own worktree — and the ORCHESTRATOR owns its
  lifecycle, NOT the agent.** Default, not the exception. Fanning out concurrent
  streams in a *single* tree is what collides on shared files (`.gitignore`,
  `CLAUDE.md`, `registry.ts`, `_app.tsx`).
  - **Orchestrator (the tactical coordinator):** create the worktree, dispatch
    the agent into it, and after it reports — review, **merge or open a PR**,
    and only THEN remove the worktree + branch.
    ```
    git worktree add ../<stream> -b <branch> dev              # orchestrator creates
    (cd ../<stream> && pnpm dev)                              # complete isolated instance
    # …dispatched agent works + verifies in ../<stream>, reports back…
    git -C <dev-path> merge <branch>                          # integrate against current dev
    git worktree remove ../<stream> && git branch -d <branch> # orchestrator cleans up — AFTER merge
    ```
    `pnpm dev` synchronizes the frozen install, generates worktree-local
    credentials, migrates and seeds auth, starts the full stack, proves
    authenticated readiness, and prints the private owner sign-in URL. There is
    no setup-worktree helper or shared `.env` step to remember.
  - **What's worktree-specific vs. shared:**
    - *Worktree-specific:* the branch/tree; generated files (`routeTree.gen.ts`,
      `.output`/`dist`); `.data`; `apps/agent/.eve`; generated owner and service
      credentials; turbo/vite caches; and the branch-derived Portless prefix.
      Multiple full stacks can run concurrently because every app in a worktree
      receives the same unique prefix. Use the readiness summary's URLs rather
      than the primary checkout's hard-coded names.
    - *Shared deliberately:* the external roadmap store
      (`SIGIL_ROADMAP_DIR`) and pnpm's content-addressed package store. Checked-in
      application behavior is shared through Git. Never copy or symlink `.env`,
      runtime directories, or generated credentials between worktrees.
  - **Recovery:** stop the worktree's stack and use `pnpm dev:reset`; restore
    only with the exact `pnpm dev:restore` command it prints. Do not hand-delete
    state or borrow another worktree's instance.
  - **Dispatched agents: work + verify in your assigned worktree and REPORT.
    Do NOT merge, do NOT `git worktree remove`, do NOT delete your branch.**
    Leave it intact for the orchestrator — removing it yourself can destroy
    unmerged work. (Brief every worker agent with this explicitly.)
- Running multiple streams in ONE worktree is allowed ONLY when they touch
  provably-disjoint files.
- Tag stories with their `worktree` so cross-worktree agents aren't confused.

## Model routing (who does what)

- **UI / UX / taste → Claude only** (opus/sonnet). NEVER route UI, interaction,
  copy voice, layout, or aesthetic work to codex/pi/gpt.
- **Mechanical plumbing** (stores, gonk tools, server fns, schema, docs) →
  `pi gpt-5.6-luna` at high thinking.
- **Coordination / judgment / review** → the session model.

## Concurrency rules (avoid collisions)

- **`pi` is SERIAL: only ONE `pi` process at a time** (its extensions share a
  SQLite db and will `database is locked` otherwise). Queue pi work.
- Claude/codex agents run in parallel **only on disjoint files**.
- **Hot shared files** — `apps/gonk/src/registry.ts`, `apps/web/src/routes/_app.tsx`,
  `apps/web/src/lib/agent-domain-outcomes.tsx`, `packages/agent-contracts/src/client-command.ts`
  — are **owned by the orchestrator**. Feature agents add their *own* new files
  and report the nav entry / tool registration for the orchestrator to batch;
  do NOT have N agents edit the same hub file in parallel.
- If two streams genuinely must edit the same file, isolate them in separate
  worktrees and merge.

## Verify against real output (non-negotiable)

- Never trust an exit code, and never pipe a command whose failure must stop a
  chain through `| tail`/`| head`/`| grep` (it masks the real exit). Capture to a
  file and `grep -c "error TS"` / read the test summary.
- After writing code, run the real check — typecheck + build + tests — and read
  the output. A green subagent report is not evidence; the build is.
- UI changes carry a **browser gate**: verify in a real browser (or a Sonnet
  subagent driving Playwright — the main session never drives Playwright
  directly), console clean.

## Commit protocol

- Commit verified work to `dev` as it lands; **concern-grouped** commits (one
  feature/concern per commit), not a mega-commit.
- **Extraction verdict gates the merge.** Any story/branch touching
  components, hooks, or presentation must carry its registry-loop verdict
  (`consumed` / `extracted` / `candidate:<X#>` with a real X-story /
  `app-domain` + why — see `building-in-sigil-chat`). The orchestrator
  checks it at merge time and bounces work that lacks one. Dispatch briefs
  for such work MUST include the verdict requirement verbatim and demand it
  in the worker's report.
- **One repo per bash call**; anchor every call with an absolute `cd`/`git -C`
  (cwd drifts between calls).
- **Verify green BEFORE committing.** A subset of a green tree is only green if
  it's self-contained — commit a package together with the `package.json`/
  `tsconfig` wiring that references it.
- Don't commit another agent's half-finished in-flight files.
- Public commits describe the product concern, not the authoring harness,
  persona, or session. Do not add agent identity or session URL trailers.

## Where things live

- **Gonk application tools** → `apps/gonk/src/registry.ts` (+ `registry/*.ts`).
  Eve discovers them over MCP via `apps/agent/agent/connections/gonk.ts` — never
  hand-copy tool defs into eve. `exec`-tier tools are denied by policy.
- **Sigil-first is the registry loop, enforced:** consume-first check before
  authoring any component/hook (grep `packages/ui` → check sigil-design
  `/showcase` + registry → install, don't re-author), and an extraction
  verdict before any UI-touching story closes (`consumed` / `extracted` /
  `candidate:<X#>` / `app-domain`). Full contract in `building-in-sigil-chat`;
  the verdict is checked at merge (see commit protocol). The `packages/data`
  `ResourceManager` and the ingress/emphasis extractions are the pattern.
- **`GONK_MCP_KEY`** is generated by `pnpm dev` under this worktree's
  `.data/dev/gonk-mcp-key` and supplied to every service. Do not copy, export,
  or symlink it for ordinary local development; an explicit value is a
  deployment/override concern.
