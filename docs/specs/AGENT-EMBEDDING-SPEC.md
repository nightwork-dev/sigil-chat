# @workspace/agent — Embeddable Agent Framework

> Date: 2026-07-16
> Status: Implemented and architect-approved — machine/integration checks green; live-browser acceptance remains
> Depends on: docs/specs/AGENT-CONTEXT-AWARENESS-SPEC.md (product model; this spec implements its surfaces)
> Scope: this repo (sigil-chat). Designed so the package ports cleanly to the sigil-design template later — nothing graph-specific may enter it.

## 1. Intent

Extract the agent-embedding pattern currently trapped inside app code into a
workspace package any app can consume. The deliverable is: **a workspace drops
`<AgentHud>` into any screen, publishes what the user is looking at through an
attention context, and gets a full agent surface — chat, streaming, tool
calls, approvals — with zero copies of this plumbing.**

What exists today and where it moves:

| Today (app-owned)                                                                                                             | Tomorrow (package)                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `apps/web/src/components/sigil-chat.tsx` (494 lines: chat surface + tool call cards + approval buttons + authorization cards) | `packages/agent/src/components/agent-chat.tsx`, `tool-call.tsx`, `authorization-card.tsx` |
| `AgentHud` function inside `apps/web/src/features/studio/reducer-studio.tsx` (~lines 980-1037)                                | `packages/agent/src/components/agent-hud.tsx` (compound)                                  |
| Inline context object built in `ReducerStudio` and passed as `JSON.stringify(context)`                                        | `packages/agent/src/lib/attention.ts` (typed contract + provider)                         |
| `apps/web/src/lib/tool-approval.ts`                                                                                           | `packages/agent/src/lib/tool-approval.ts` (moved verbatim)                                |

The graph studio becomes the first consumer, not a special case.

## 2. Package layout

```
packages/agent/
├── package.json          → name @workspace/agent, exports { "./*": "./src/*.ts", ... } per house pattern
├── tsconfig.json         → copy packages/chat/tsconfig.json
└── src/
    ├── lib/
    │   ├── attention.ts        → AttentionContext types, AttentionProvider, useAttention, serializeAttention
    │   └── tool-approval.ts    → moved from apps/web/src/lib/tool-approval.ts, unchanged API
    ├── hooks/
    │   └── use-agent-session.ts → useAgentSession wrapper around eve/react's useEveAgent
    └── components/
        ├── agent-chat.tsx       → AgentChat (the generalized SigilChat surface)
        ├── agent-hud.tsx        → AgentHud compound (Root/Trigger/Panel/Expand)
        ├── tool-call.tsx        → ToolCall, ToolState (extracted from sigil-chat.tsx)
        ├── authorization-card.tsx → the authorization part card
        └── json-value.tsx       → JsonValue + formatValue (shared by tool-call)
```

Scaffolding steps (repo CLAUDE.md "Adding a new workspace package" — follow all five):
`@workspace/agent` in `apps/web/package.json` deps; paths entry in
`apps/web/tsconfig.json`; `@source "../../../../packages/agent/src/**/*.{ts,tsx}";`
in `packages/ui/src/styles/globals.css` (it has .tsx — required); `pnpm install`.

Package dependencies: `eve` + `ai` move from `apps/web/package.json` into
`packages/agent/package.json` (apps/web keeps them only if something outside
the extraction still imports them — expected: nothing). `@workspace/ui` and
`@workspace/chat` as workspace deps. React as peer, matching packages/chat.

Style: semicolon-free, double quotes, tokens only, base-ui `render` prop
conventions — the `component-development` skill is the authority. All files
being moved already comply after the 2026-07-16 fix round; keep them that way.

## 3. The attention contract (`lib/attention.ts`)

The typed replacement for the ad-hoc `Record<string, unknown>` context.

```ts
export interface AttentionSelection {
  kind: string // app-defined, e.g. "reducer-node" | "reducer-edge" | "document"
  id: string
  label?: string // human name shown in the HUD pill ("Ask about {label}")
  detail?: Record<string, string> // small, flat, display-safe facts (source/target, reducerId…)
}

export interface AttentionContext {
  application: string // stable app id, e.g. "sigil-chat"
  route: string // current route path
  workspace?: { kind: string; id: string; revision?: number; label?: string }
  selection?: AttentionSelection // primary, retained for simple consumers
  selections?: AttentionSelection[] // ordered working set, primary first
  hover?: AttentionSelection // sustained explicit target, expanded privacy only
  history?: AttentionActivityEvent[] // bounded semantic focus/action trail
}
```

Rules the implementation must enforce (these come from the product spec §1 and
are non-negotiable):

- **Small and meaningful, not a DOM scrape.** `detail` values are strings; past
  4 KB the serializer emits a dev-mode `console.warn`, removes optional detail
  deterministically, and truncates required identifiers only as a final
  valid-JSON fallback. This is shared attention, not surveillance — the cap is
  the structural guard.
- **Serialization is owned here.** `serializeAttention(ctx): string` produces
  the string handed to the transport. No consumer ever `JSON.stringify`s a
  context by hand.
- **Privacy is user-controlled.** Minimal sends the primary identifiers;
  Focused sends the selected working set and a short focus/action trail;
  Expanded sends the larger bounded trail plus at most two sustained hover
  entries. Hover is discarded first when the byte budget tightens.
- **History is semantic, not a clickstream.** Applications explicitly record
  focus, navigation, edits, executions, approvals, and dismissals against typed
  targets. No arbitrary DOM attributes, pointer paths, or keystrokes are read.

React wiring:

```tsx
const AttentionContextReact = createContext<AttentionContext | null>(null)

export function AttentionProvider({
  context,
  children,
}: {
  context: AttentionContext
  children: ReactNode
})
export function useAttention(): AttentionContext | null // null = no provider; the HUD works without one
```

The workspace renders `<AttentionProvider context={...}>` around its screen and
rebuilds `context` on selection change (plain derived object at render time —
no effects, no store). The HUD reads it live via `useAttention()`, so the
context attached to a message is whatever the user is looking at **at send
time** — same behavior as today's `clientContextRef` pattern, now typed.

**Migration note (shape change, deliberate):** today's inline context in
`reducer-studio.tsx` (~lines 252-270) puts `reducerId` (node case) and
`source`/`target` (edge case) as TOP-LEVEL selection fields. Under this
contract those move into `selection.detail` (`detail: { reducerId }`,
`detail: { source, target }`). This is a restructuring, not a pure typing
pass — the agent-side prompt consumers of the serialized context see the new
nesting. Acceptable: nothing parses the old shape programmatically today.

## 4. Session hook (`hooks/use-agent-session.ts`)

The single seam to `eve/react`. Nothing else in the package (and nothing in
consuming apps) imports `eve/react` directly — when the transport changes,
this file is the blast radius.

```ts
import type { PrepareSend } from "eve/react" // eve's own exported type — do NOT invent a new name.
// PrepareSend = (input: SendTurnPayload) => SendTurnPayload | Promise<SendTurnPayload>
// (SendTurnPayload: eve/dist/src/client/types.d.ts)

export interface AgentSessionOptions {
  /** merged into every send; attention + approval header are added automatically */
  prepareSend?: PrepareSend
}

export function useAgentSession(options?: AgentSessionOptions): AgentSession
// AgentSession = ReturnType<typeof useEveAgent> re-exported under our name
```

Behavior (moves out of today's `SigilChat`):

- Reads `useAttention()`; on each send injects `clientContext: serializeAttention(ctx)` when a provider is present.
- Injects the `TOOL_APPROVAL_HEADER` from `getToolApprovalMode()` exactly as today.
- Derived helpers exported alongside: `isBusy(session)` (submitted|streaming) and
  `pendingApproval(session): boolean` — true when any message part is in state
  `approval-requested`. The HUD pill consumes these.

**Session ownership — `AgentSessionProvider`, above the router's page swaps.**
`useEveAgent` discards conversation state when the component that owns the hook
unmounts, unless an external `ClientSession`/`initialSession` is threaded in
(documented in eve/react's own use-eve-agent.d.ts). The product spec requires
the SAME session to survive HUD collapse/expand AND the Expand navigation to
the full-page chat route (AGENT-CONTEXT-AWARENESS-SPEC.md §"Full-screen chat is
reachable without starting a new agent session" and acceptance criterion 8).
Therefore:

```tsx
export function AgentSessionProvider({ children }: { children: ReactNode })
// Owns the useEveAgent store. Mounted ONCE, in apps/web/src/routes/__root.tsx.
// The hook is SSR-safe and constructs an inert store during server rendering;
// no session request occurs until a client-side send. Route navigation swaps
// pages below it; the client store and conversation survive.
```

`useAgentSession()` requires the provider (throw with a clear message if
absent) and returns the shared session. `AgentHud.Root` and the full-page chat
route are both consumers — neither owns the session lifetime. `AgentChat`
receives the session as a prop and never calls the hook itself.

## 5. Components

### 5.1 `AgentChat` — the conversation surface

Today's `SigilChat` with the app-specific parts turned into props:

```tsx
interface AgentChatProps {
  session: AgentSession // from useAgentSession — required, no internal hook call
  placeholder?: string // default "Ask the agent…"
  emptyState?: ReactNode // default: current Empty block, copy generalized
  statusLine?: ReactNode // header identity line; default null (today's "Local Codex · Eve sessions · Gonk tools" becomes the sigil-chat app's prop value)
  showApprovalMode?: boolean // header NativeSelect; default true
  showNewSession?: boolean // header reset button; default true
  className?: string
}
```

Everything else moves unchanged: message mapping (text/reasoning/extra parts),
the error alert, `ChatList`/`ChatInput` composition, `StatusIndicator`.
`AgentMessage`, `AgentPart` stay module-private to `agent-chat.tsx`.

`ToolCall` (with its structural `isBinaryApproval` logic — exactly 2 options,
exactly 1 danger-styled — as fixed 2026-07-16), `ToolState`,
`AuthorizationCard`, and `JsonValue` move to their own files listed in §2 and
are exported: they are reusable display surfaces (an approval inbox, a run
inspector will want them). Their prop shapes stay display-shaped (they take
Eve part objects today — acceptable; the eve types are re-exported through
`hooks/use-agent-session.ts` so the import seam stays single).

### 5.2 `AgentHud` — compound component

Compound Root/Parts (mandatory: it renders in every workspace). Context
carries `{ session, open, setOpen, attention }`.

```tsx
export const AgentHud = { Root, Trigger, Panel, Expand }

function Root({
  children,
  defaultOpen,
  open,
  onOpenChange,
  sessionOptions,
  className,
})
// - consumes the shared session via useAgentSession(sessionOptions) — the
//   session itself is owned by AgentSessionProvider (§4), so it survives both
//   collapse/expand and navigation away from this Root
// - controlled (open/onOpenChange) or uncontrolled (defaultOpen) — support both, like base-ui
// - RENDERS A HOST <div>: Root owns the shared ANCHOR position (today's
//   "absolute bottom-4 right-4 z-30 xl:right-[316px]" — identical between
//   pill and panel states in reducer-studio.tsx:1027/:1039, so it belongs
//   here, passed once via Root's className by the caller). Trigger and Panel
//   carry only their own SHAPE classes (rounded-full pill sizing vs. the
//   panel grid) — callers never duplicate the anchor.

function Trigger({ className, children })
// the collapsed pill. Default content: BotIcon + "Ask about {label}" where
// label = attention.selection?.label ?? attention.selection?.id
//      ?? attention.workspace?.label ?? "this workspace"
// (the selection.id fallback preserves today's behavior for edge selections,
//  which have an id but no label — reducer-studio.tsx:166)
// STATE ENCODING (each signal means exactly one thing — ux-design-language):
// - pendingApproval(session) → StatusDot destructive/pulse + label "Approval needed"
// - isBusy(session)          → StatusDot primary/pulse (agent working while collapsed)
// - otherwise                → plain pill, no dot
// Hidden while open.

function Panel({ className, children })
// visible while open. Default children: header (title, context label,
// Expand slot, collapse button) + <AgentChat session={session}/>.
// Accepts children to override the body. Keeps today's responsive sizing
// (min() width/height, max-sm inset behavior).

function Expand({ to, children })
// renders the header "Expand" button via Button render={<Link to={...}/>}.
// `to` required — the package does not know the app's routes.
```

This covers the product spec's HUD states as: **at rest** = Trigger,
**working / approval-required** = Trigger state encoding + Panel content,
**expanded** = the app's own full-page route via Expand. The intermediate
"composing attached to selection" state is explicitly OUT of v1 (see §8).

### 5.3 What does NOT move

- `reducer-studio.tsx`'s canvas, inspector, and all graph anything — consumer code.
- The `/eve/**` nitro proxy in `apps/web/vite.config.ts` — deployment wiring, stays app-owned. Document it in the package README as a consumer requirement.
- Gonk registry / server — separate service, unchanged.

## 6. Migration of existing consumers

1. Build the package per §2 (move files, then fix imports — `git mv` semantics,
   don't rewrite). CAUTION: `TOOL_APPROVAL_HEADER`'s value
   (`"x-sigil-tool-approval"`) is independently duplicated as a raw string
   literal in `apps/agent/agent/channels/eve.ts:13` — it is not an import and
   will not show up as dangling; renaming the header during the move silently
   desyncs the approval flow. Don't rename it, and add a comment on both sides
   pointing at each other.
2. Mount `<AgentSessionProvider>` in `apps/web/src/routes/__root.tsx` (inside
   the theme/query providers, wrapping the Outlet).
3. `apps/web/src/routes/_app/chat.tsx` and `routes/footer/chat.tsx`: replace
   `SigilChat` with a small app component `apps/web/src/components/app-chat.tsx`
   that calls `useAgentSession()` + `<AgentChat session statusLine="Local Codex · Eve sessions · Gonk tools" …/>`
   (route header comments updated per `extending-this-template`).
4. `reducer-studio.tsx`: delete the local `AgentHud`; wrap the studio content in
   `<AttentionProvider context={attention}>` where `attention` is derived at
   render from `document`/`selection` (same information as today's inline
   object, restructured per the §3 migration note: `reducerId`/`source`/`target`
   move under `selection.detail`; set `workspace.label = document.title` so the
   no-selection pill keeps an identifying label); mount
   `AgentHud.Root` → `Trigger` + `Panel` (+ `Expand to="/chat"`), with
   today's positioning classes passed via className.
5. Delete `apps/web/src/components/sigil-chat.tsx` and
   `apps/web/src/lib/tool-approval.ts` after the moves. `rg` for dangling
   imports; zero references may remain.

## 7. Acceptance criteria

Machine bar:

- [x] `pnpm -r typecheck` green across all projects; `pnpm -r test` green.
- [x] Package has unit tests (vitest, same setup as packages/graph): attention
      serialization (cap enforcement, stable field order), `pendingApproval`
      derivation from a fixture message, tool-approval store behavior (moved
      file keeps its semantics — mode parse, cross-tab storage event).
- [x] Zero imports of `eve/react` outside `packages/agent/src/hooks/use-agent-session.ts`.
- [x] Zero graph imports (`@workspace/graph*`) inside `packages/agent`.

Behavior bar (component-development verification: real browser, real interaction —
requires `codex login` + local registry + `pnpm dev`):

Mounted integration coverage in
`packages/agent/src/components/agent-session-integration.test.tsx` locks the
provider/session, send-time attention, approval response, collapse/reopen, and
responsive-class contracts below. The boxes remain unchecked until the same
flows are exercised against a real Eve/Gonk turn in a live browser.

- [ ] Studio: select a node, open HUD, ask "what is this?" — the request carries
      the typed attention context (verify in the Eve request payload) and the
      answer references the selected node.
- [ ] Collapse the HUD mid-stream — pill shows the working state; reopen — the
      streaming conversation is still there.
- [ ] Expand-continuity: start a conversation in the studio HUD, click Expand
      to `/chat` — the SAME conversation is there (no new session);
      navigate back to the studio — still the same session
      (AgentSessionProvider above the router's page swaps; product-spec
      acceptance criterion 8).
- [ ] Trigger a write tool with approval mode "ask" — collapsed pill shows the
      approval state; open, approve once, tool runs.
- [ ] `/chat` full-page surface works with zero attention provider
      (context is simply absent — no crash, no empty-object junk sent).
- [ ] ~375px viewport pass on Panel and Trigger; touch targets ≥44px.
- [ ] Browser console clean on all of the above.

Review bar: independent review (fresh context, different lineage than the
implementer) before merge — writer ≠ reviewer.

## 8. Non-goals (v1)

- **Server-verified approvals.** The trust model stays as documented in
  README "Trust model" — client preference, honest about it. Framework API
  must not _pretend_ otherwise (no prop named `security` or `enforce`).
- **Push-channel attention sync / presence.** Polling and send-time context
  attach are v1; a live channel is its own spec.
- **The composing state** (prompt attached visually to the selection) and HUD
  docking/position persistence.
- **Multi-agent / multi-session routing.** One session per
  `AgentSessionProvider`.
- **Porting to the sigil-design template main branch.** Do the extraction
  here first; the port is a follow-up once the API survives a second consumer.

## 9. Execution notes

- One lane, sequential — this is a refactor with a moving dependency graph,
  not parallelizable. Estimated 4-6 focused hours.
- Implementer: taste-bearing surfaces (Trigger/Panel states, empty-state copy)
  are Claude-lane work per house policy; the mechanical file moves are not.
- Commit shape: (1) package scaffold + verbatim file moves, (2) attention
  contract + session hook + AgentChat generalization, (3) AgentHud compound +
  studio/chat-route migration + deletions, (4) tests. Each commit typechecks.
