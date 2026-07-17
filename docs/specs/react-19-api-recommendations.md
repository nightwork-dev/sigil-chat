# React 19+ API Recommendations

> Date: 2026-07-08
> Status: Draft implementation guidance
> Scope: `apps/web`, `packages/ui`, `packages/chat`, `packages/data`,
> `packages/canvas`, and future `packages/forms` / `packages/editors`

## 1. Summary

React 19+ does not replace `useEffect`. It makes the intended boundary clearer:
Effects are for synchronizing with systems outside React. Most state derivation,
user-event work, form submission state, and optimistic UI should move to render
logic, event handlers, Actions, or cache/mutation libraries.

Recommended house rule:

> Render calculates. Events cause. Actions submit. Query caches. Effects
> synchronize with external systems.

Local baseline:

- This repo currently uses `react` and `react-dom` `19.2.4`.
- The current official React docs are for React `19.2`.
- React's versions page lists `19.2.7` as the latest React 19.2 patch release
  as of June 2026.

## 2. Primary Recommendation

Keep the repo's existing "no unnecessary Effects" posture and make it more
explicit for React 19+:

- Do not use `useEffect` for derived state.
- Do not use `useEffect` for user-event-specific work.
- Do not use `useEffect` for app data fetching in normal screens.
- Do use `useEffect` for external synchronization: DOM measurement, browser
  APIs, timers, subscriptions, media APIs, websockets, imperative canvas,
  CodeMirror, Tiptap, Lexical, chart runtimes, animation loops, and third-party
  widgets.
- Prefer `useSyncExternalStore` for external stores with subscriptions.
- Prefer route loaders plus TanStack Query for app data.
- Prefer React Actions APIs for form submission state and local form UX where
  they fit.

This is not a ban on Effects. It is a higher bar: every Effect should name the
external system it synchronizes with.

## 3. Decision Table

| Need | Use | Avoid |
| --- | --- | --- |
| Calculate display state from props/state | Render-time calculation, maybe `useMemo` if expensive | `useEffect` plus mirrored state |
| Reset an entire component when identity changes | `key` | `useEffect(() => setState(...), [id])` |
| Run logic because the user clicked/typed/submitted | Event handler or form `action` | Effect that observes state after the fact |
| Fetch cached app data | Route loader plus TanStack Query hook | Component-local `useEffect` fetch |
| Run a mutation that affects shared server cache | TanStack Query mutation plus invalidation/optimistic cache update | Local optimistic state only |
| Submit a form and show pending/error/result | `<form action>`, `useActionState`, `useFormStatus` | Manual pending state scattered through fields |
| Add local optimistic UI around a form/list | `useOptimistic` | Duplicated pending arrays in unrelated state |
| Subscribe to browser/external/editor runtime | `useEffect` or `useLayoutEffect` | Render-time imperative setup |
| Effect callback needs latest props/state without resubscribing | `useEffectEvent` | Refs used only to dodge dependencies |
| Expose DOM ref from a new React 19-only component | `ref` prop | New `forwardRef` by default |
| Read a Suspense-compatible resource | `use` only with cached/framework-managed resources | Ad hoc fetch Promise creation during render |
| Avoid repeated expensive render calculations | React Compiler when enabled, or measured `useMemo` | Blanket `useMemo` / `useCallback` |

## 4. API Guidance

### 4.1 `useEffect`

Use Effects to synchronize React state with something React does not own.

Good examples in this repo:

- Measuring element size.
- Attaching and cleaning up DOM or window listeners.
- Running `requestAnimationFrame` loops.
- Managing timers and intervals.
- Creating and disposing third-party editor instances.
- Bridging canvas, SVG, chart, media, or graph runtimes.

Avoid Effects for these patterns:

```tsx
// Avoid: derived state.
const [fullName, setFullName] = useState("")

useEffect(() => {
  setFullName(`${firstName} ${lastName}`)
}, [firstName, lastName])
```

```tsx
// Prefer: calculate during render.
const fullName = `${firstName} ${lastName}`
```

```tsx
// Avoid: event-specific work after observing state.
useEffect(() => {
  if (saved) {
    toast.success("Saved")
  }
}, [saved])
```

```tsx
// Prefer: event/action/mutation callback where the cause is known.
async function handleSave() {
  await save()
  toast.success("Saved")
}
```

### 4.2 `useEffectEvent`

`useEffectEvent` is for event-like callbacks that are owned by an Effect.
It lets that callback see the latest committed props/state without making the
Effect resubscribe, reconnect, or recreate an external runtime.

Use it when:

- A timer callback needs the latest settings but the timer should not restart.
- A websocket listener needs latest user preferences but the socket should not
  reconnect.
- A CodeMirror/Tiptap/Lexical callback needs latest props but the editor should
  not be destroyed and recreated.
- A DOM event listener needs latest state but the listener binding should stay
  stable.

Do not use it to hide missing dependencies. If a value should cause the external
system to resynchronize, keep it in the Effect dependency list.

```tsx
import { useEffect, useEffectEvent } from "react"

function PresenceSocket({
  roomId,
  muted,
  onConnected,
}: {
  roomId: string
  muted: boolean
  onConnected?: (roomId: string) => void
}) {
  const handleConnected = useEffectEvent(() => {
    if (!muted) {
      onConnected?.(roomId)
    }
  })

  useEffect(() => {
    const socket = connectPresence(roomId)
    socket.on("connected", handleConnected)
    return () => socket.disconnect()
  }, [roomId])

  return null
}
```

Recommendation for editor components: use `useEffectEvent` for `onValueChange`,
`onSelectionChange`, `onDiagnosticsChange`, and analytics callbacks when they
are invoked by an editor instance created inside an Effect.

### 4.3 Actions, `useActionState`, and `useFormStatus`

React 19 lets `<form action={fn}>` run a function as the form submission
handler. React tracks the action as a Transition and integrates it with
`useActionState`, `useFormStatus`, and `useOptimistic`.

Use these APIs for component-library form ergonomics:

- `Form.Submit` should be able to read `useFormStatus`.
- Form examples should show `useActionState` for submission result and pending
  state.
- Field components should remain plain accessible inputs; do not make every
  input depend on an action framework.
- App-level mutations that affect cached server data should still use TanStack
  Query invalidation or optimistic cache updates.

```tsx
import { useActionState, type ReactNode } from "react"
import { useFormStatus } from "react-dom"

type SaveState = {
  message: string | null
}

const initialState: SaveState = { message: null }

async function saveProfile(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const name = String(formData.get("name") ?? "")
  await updateProfile({ name })
  return { message: "Profile saved" }
}

function ProfileForm() {
  const [state, action] = useActionState(saveProfile, initialState)

  return (
    <form action={action}>
      <input name="name" />
      <SubmitButton>Save</SubmitButton>
      {state.message ? <p role="status">{state.message}</p> : null}
    </form>
  )
}

function SubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus()

  return (
    <button type="submit" disabled={pending} aria-busy={pending}>
      {children}
    </button>
  )
}
```

TanStack Start note: React Server Functions (`"use server"`) and TanStack
Start's `createServerFn` are related ideas but not the same contract. This
template should continue using `createServerFn` plus TanStack Query for normal
server data unless a future TanStack Start RSC plan explicitly changes that.

### 4.4 `useOptimistic`

Use `useOptimistic` for local optimistic UI that is naturally scoped to a form
or component:

- Add a message to a local conversation while send is pending.
- Show a temporary uploaded-file row before the server response returns.
- Insert a draft comment in the visible list attached to a form.
- Toggle local reaction state while the action is pending.

Do not use `useOptimistic` as the only source of truth for data that is shared
across routes, tabs, or many components. For shared server data, use TanStack
Query optimistic cache updates, invalidation, and refetching.

### 4.5 `use`

`use` can read a Context or a Promise during render. The Promise case should be
treated as a Suspense/resource API, not a new default data-fetching habit.

Recommendations:

- Do not create ad hoc fetch Promises during client render and pass them to
  `use`.
- Prefer route loaders and TanStack Query in app screens.
- Use `use` only when the resource is created, cached, and suspended by the
  framework or an intentional resource layer.
- Consider `use` for library internals only when it materially simplifies
  Suspense integration and the cache contract is explicit.

### 4.6 `ref` as a Prop

React 19 supports `ref` as a normal prop for function components. For new
React-19-only components, prefer this shape:

```tsx
import type { ComponentPropsWithoutRef, Ref } from "react"

interface PanelProps extends ComponentPropsWithoutRef<"section"> {
  ref?: Ref<HTMLElement>
}

function Panel({ ref, ...props }: PanelProps) {
  return <section ref={ref} {...props} />
}
```

Recommendations:

- Use `ref` as a prop for new internal components that target React 19+ only.
- Keep `forwardRef` when wrapping third-party primitives, shadcn components, or
  code paths where the surrounding pattern still expects it.
- Do not churn existing stable primitives solely to remove `forwardRef`.

### 4.7 React Compiler

React Compiler can automatically memoize many calculations and callbacks. The
library should become compiler-friendly before enabling it broadly.

Recommendations:

- Keep components pure.
- Avoid mutation of props and render-time side effects.
- Avoid relying on object identity changes as hidden behavior.
- Use `useMemo`, `useCallback`, and `React.memo` only for measured cost,
  required referential stability, or third-party API contracts.
- Do not enable React Compiler across `packages/ui` until there is a focused
  compiler audit and smoke test pass.

## 5. Package-Level Recommendations

### 5.1 `@workspace/ui`

- Keep inputs and primitives framework-neutral.
- Add or standardize a submit button primitive that can consume
  `useFormStatus` when rendered inside a form.
- Prefer render-time derivation over mirrored component state.
- Prefer `ref` prop for new React 19-only components, while preserving existing
  `forwardRef` surfaces when churn would be noisy.
- Keep Effects only for real external systems: measurement, observers,
  listeners, animation frames, timers, and third-party runtimes.

### 5.2 Future `@workspace/forms`

- Build examples around both React Actions and TanStack Query mutations.
- Treat `useActionState` as the first-class primitive for action result state.
- Use `useFormStatus` in submit/reset/action controls.
- Keep validation adapters explicit: Zod, TanStack Form, and optional React Hook
  Form integration can coexist, but shared field chrome should not depend on one
  validation engine.
- Prefer uncontrolled native form fields where the value is only needed on
  submit. Use controlled fields for live validation, dependent fields, editor
  widgets, and complex inputs.

### 5.3 Future `@workspace/editors`

- Effects are the correct place to create and destroy CodeMirror, Tiptap,
  Lexical, and similar editor instances.
- Use `useEffectEvent` for latest callback props without rebuilding the editor.
- Use explicit controlled/uncontrolled boundaries:
  - `defaultValue` seeds the editor once.
  - `value` means the parent controls the document.
  - `onValueChange` reports changes without forcing recreation.
- Use `useSyncExternalStore` if multiple React children need to subscribe to an
  editor state source.
- Keep editor dependency closures isolated from `@workspace/ui`.

### 5.4 `@workspace/data`

- Server-mode grids should emit state changes and let callers own fetching with
  TanStack Query.
- Avoid Effects that mirror grid props into local state; use controlled state,
  reducers, or TanStack Table state callbacks.
- Use `useOptimistic` only for local draft rows or component-scoped pending UI.
  Use Query cache updates for shared server data.

### 5.5 `@workspace/chat`

- Message send flows are a strong fit for local `useOptimistic` when the message
  list is scoped to the current conversation view.
- Shared conversation history should still be backed by Query cache or stream
  state.
- Streaming readers, scroll observers, timers, and websocket/SSE subscriptions
  remain valid Effect use cases.

## 6. Migration Checklist

When touching a component with Effects:

1. Ask: what external system does this Effect synchronize with?
2. If there is no external system, remove the Effect.
3. If it derives state, calculate during render.
4. If it reacts to a user event, move the logic to the event handler or form
   action.
5. If it fetches app data, move the fetch to a route loader, domain hook, or
   TanStack Query.
6. If it resets state for a different entity, prefer a `key`.
7. If the Effect is legitimate, split dependencies into:
   - reactive values that should resynchronize the external system;
   - event-like callbacks that should see latest state but not resynchronize.
8. Use `useEffectEvent` only for the second group.
9. Keep the hook lint rules green.

When adding a form:

1. Use native `<form>` semantics first.
2. Use `useActionState` for local action result/pending state.
3. Use `useFormStatus` for submit controls.
4. Use TanStack Query for mutations that update shared cached server data.
5. Use `useOptimistic` for component-scoped pending rows/messages/items.

When adding a heavy editor:

1. Create the external editor runtime in an Effect.
2. Destroy it in the cleanup.
3. Keep editor callback props fresh with `useEffectEvent`.
4. Avoid rebuilding the editor for cosmetic prop changes.
5. Add browser smoke tests for mount, typing, callback delivery, and cleanup.

## 7. Open Decisions

1. React Compiler adoption:
   - Recommendation: prepare code now, do not enable broadly until a separate
     compiler audit.
2. Primary form engine:
   - Recommendation: use React Actions APIs for low-level form UX and examples;
     use TanStack Query for cached server mutations; evaluate TanStack Form for
     complex validation orchestration.
3. React Server Components and Server Functions:
   - Recommendation: do not adopt RSC or React Server Functions as a library
     assumption. Let TanStack Start's roadmap and this template's app needs drive
     that separately.
4. `forwardRef` migration:
   - Recommendation: use `ref` prop for new React 19-only components, but avoid
     broad churn in existing wrappers.

## 8. References

- React versions: https://react.dev/versions
- React 19.2 release notes: https://react.dev/blog/2025/10/01/react-19-2
- You Might Not Need an Effect: https://react.dev/learn/you-might-not-need-an-effect
- `useEffect`: https://react.dev/reference/react/useEffect
- `useEffectEvent`: https://react.dev/reference/react/useEffectEvent
- `useActionState`: https://react.dev/reference/react/useActionState
- `useFormStatus`: https://react.dev/reference/react-dom/hooks/useFormStatus
- `useOptimistic`: https://react.dev/reference/react/useOptimistic
- `use`: https://react.dev/reference/react/use
- `<form>` action reference: https://react.dev/reference/react-dom/components/form
- `forwardRef`: https://react.dev/reference/react/forwardRef
- React Compiler: https://react.dev/learn/react-compiler
