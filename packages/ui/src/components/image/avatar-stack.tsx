// AvatarStack: overlapping stacked avatars with a `max` cap and a "+N" overflow
// chip. The data-driven convenience wrapper over the primitive Avatar family —
// pass an array of people, get the stack, the ring separation, and the overflow
// count without hand-composing each <Avatar> at the call site. (Named distinct
// from avatar.tsx's low-level `AvatarGroup` layout container, which this reuses.)
//
// Reuses the existing Avatar / AvatarImage / AvatarFallback primitives plus the
// AvatarGroup layout container and AvatarGroupCount chip from avatar.tsx (the
// -space-x-2 overlap + ring-background separation already live there). This
// module only adds the slice-to-max + remainder-count logic on top, so the
// visual language stays single-sourced.
//
// `size` threads through to every child via Avatar's data-size, which the
// layout container keys its sizing off — one prop resizes the whole stack.
// Tokens only (inherited from Avatar: bg-muted fallbacks, ring-background seams).

import * as React from "react"

import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup as AvatarGroupRoot,
  AvatarGroupCount,
} from "@workspace/ui/components/avatar"

interface AvatarStackItem {
  src?: string
  alt: string
  /** Explicit fallback text (e.g. initials). Defaults to the first char of `alt`. */
  fallback?: string
}

export interface AvatarStackProps
  extends Omit<React.ComponentProps<typeof AvatarGroupRoot>, "children"> {
  avatars: AvatarStackItem[]
  /** Max avatars shown before collapsing the rest into a +N chip. Default 4. */
  max?: number
  size?: "default" | "sm" | "lg"
}

function AvatarStack({
  avatars,
  max = 4,
  size = "default",
  ...props
}: AvatarStackProps) {
  const visible = avatars.slice(0, max)
  const overflow = avatars.length - visible.length

  return (
    <AvatarGroupRoot {...props}>
      {visible.map((item, index) => (
        <Avatar key={index} size={size}>
          {item.src && <AvatarImage src={item.src} alt={item.alt} />}
          <AvatarFallback>
            {item.fallback ?? item.alt.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 && (
        <AvatarGroupCount aria-label={`${overflow} more`}>
          +{overflow}
        </AvatarGroupCount>
      )}
    </AvatarGroupRoot>
  )
}

export { AvatarStack }
