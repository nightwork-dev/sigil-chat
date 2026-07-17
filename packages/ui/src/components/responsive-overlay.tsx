"use client"

// A trigger that opens a Popover on desktop and a Drawer on mobile — the
// same content, the interaction that fits the input device. Repeated
// verbatim across enough surfaces (any "click to see more, on a phone that
// means a bottom sheet") that it's worth one shared component instead of
// re-deriving the isMobile branch each time.

import type { ReactElement, ReactNode } from "react"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerTrigger,
} from "@workspace/ui/components/drawer"

interface ResponsiveOverlayProps {
  trigger: ReactNode
  title: string
  description?: string
  children: ReactNode
  /** Popover-only: alignment against the trigger. Defaults to "end". */
  align?: "start" | "center" | "end"
  className?: string
}

function ResponsiveOverlay({ trigger, title, description, children, align = "end", className }: ResponsiveOverlayProps) {
  const isMobile = useIsMobile()

  if (!isMobile) {
    return (
      <Popover>
        <PopoverTrigger render={trigger as ReactElement} />
        <PopoverContent data-slot="responsive-overlay" align={align} sideOffset={8} className={className}>
          {children}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Drawer>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent data-slot="responsive-overlay" className="max-h-[86vh]">
        <DrawerHeader className="pb-3 text-left">
          <DrawerTitle>{title}</DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>
        <div className={className ?? "max-h-[68vh] overflow-y-auto px-4 pb-6 md:px-6"}>{children}</div>
      </DrawerContent>
    </Drawer>
  )
}

export { ResponsiveOverlay }
export type { ResponsiveOverlayProps }
