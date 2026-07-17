# @workspace/ui

Shared UI component library. shadcn components with Base UI primitives, Tailwind v4.

## Utilities

The `cn()` utility lives at `src/lib/utils.ts` and is exported via the package exports map:

```tsx
import { cn } from "@workspace/ui/lib/utils"
```

All components in this package and consuming packages should import `cn` from this path. Do NOT redefine `cn` inline.

## Exports Map

```json
"./globals.css"     → "./src/styles/globals.css"
"./lib/*"           → "./src/lib/*.ts"
"./components/*"    → "./src/components/*.tsx"
"./hooks/*"         → "./src/hooks/*.ts"
```

## Adding Components

```bash
pnpm dlx shadcn@latest add <component> -c packages/ui
```

Components use Base UI primitives (not Radix).

## Styling

Tailwind v4 with CSS variables in `src/styles/globals.css`. Theme tokens for colors, radii, spacing. Dark theme by default.
