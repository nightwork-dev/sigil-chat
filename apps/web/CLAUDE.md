# Web App (TanStack Start)

## Dev Server

```bash
pnpm dev  # starts via portless at http://<app-name>.localhost:1355
```

## Utilities

Import `cn` from the UI package — do NOT define it inline:
```tsx
import { cn } from "@workspace/ui/lib/utils"
```

## Server Functions

Use `createServerFn` from `@tanstack/react-start`. These run on the server and can access databases, env vars, etc.

- Input validation: use `.validator()`; `.inputValidator()` is deprecated.
- Always wrap in React Query hooks for caching and invalidation

## Routing

File-based via TanStack Router. Routes in `src/routes/`.
- `routeTree.gen.ts` is auto-generated — never edit, never commit
- Layout routes wrap child routes with `<Outlet />`

## Styling

Tailwind v4. Import globals from `@workspace/ui/globals.css`. Use `cn()` for conditional classes.
