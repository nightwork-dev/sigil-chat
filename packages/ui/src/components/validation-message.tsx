"use client"

// A single validation message (error/warning/info) as named parts, plus two
// composite views: List (full, one row per message) and Summary (compact
// inline). Root provides severity/message/location via context so parts can
// pick what they need — swap between List and Summary without touching the
// per-message rendering.

import { createContext, useContext, type ReactNode } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@workspace/ui/lib/utils"

interface ValidationMessageContext {
  severity: "error" | "warning" | "info"
  message: string
  location?: { line?: number; column?: number }
}

const Ctx = createContext<ValidationMessageContext | null>(null)

function useValidationMessage() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("ValidationMessage parts must be used inside <ValidationMessage.Root>")
  return ctx
}

const severityVariants = cva("text-[10px] font-medium uppercase", {
  variants: {
    severity: {
      error: "text-destructive",
      warning: "text-warning",
      info: "text-muted-foreground",
    },
  },
})

const severityDotVariants = cva("rounded-full", {
  variants: {
    severity: {
      error: "bg-destructive",
      warning: "bg-warning",
      info: "bg-muted-foreground",
    },
    size: {
      sm: "size-1.5",
      default: "size-2",
    },
  },
  defaultVariants: { severity: "info", size: "default" },
})

function Root({ children, className, severity, message, location }: ValidationMessageContext & { children: ReactNode; className?: string }) {
  return (
    <Ctx.Provider value={{ severity, message, location }}>
      <div data-slot="validation-message" className={className}>{children}</div>
    </Ctx.Provider>
  )
}

function SeverityBadge({ className }: { className?: string }) {
  const { severity } = useValidationMessage()
  return <span className={cn(severityVariants({ severity }), className)}>{severity}</span>
}

function SeverityDot({ className, size }: { className?: string } & Pick<VariantProps<typeof severityDotVariants>, "size"> ) {
  const { severity } = useValidationMessage()
  return <span className={cn(severityDotVariants({ severity, size }), "inline-block shrink-0", className)} />
}

function Message({ className }: { className?: string }) {
  const { message } = useValidationMessage()
  return <span className={cn("text-foreground/80", className)}>{message}</span>
}

function Location({ className, onNavigateLine }: { className?: string; onNavigateLine?: (line: number) => void }) {
  const { location } = useValidationMessage()
  if (!location || location.line == null) return null

  if (onNavigateLine) {
    return (
      <button
        type="button"
        onClick={() => onNavigateLine(location.line!)}
        className={cn(
          "ml-auto shrink-0 cursor-pointer font-mono text-[10px] text-muted-foreground underline decoration-muted-foreground/30 hover:text-foreground",
          className
        )}
      >
        {location.line}
        {location.column != null && `:${location.column}`}
      </button>
    )
  }

  return (
    <span className={cn("ml-auto shrink-0 font-mono text-[10px] text-muted-foreground", className)}>
      {location.line}
      {location.column != null && `:${location.column}`}
    </span>
  )
}

interface ValidationMsg {
  severity: "error" | "warning" | "info"
  message: string
  location?: { line?: number; column?: number }
}

function List({ messages, valid, className, onNavigateLine }: { messages: Array<ValidationMsg> | undefined; valid?: boolean; className?: string; onNavigateLine?: (line: number) => void }) {
  if (!messages || messages.length === 0) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="size-2 rounded-full bg-success" />
        <span className="text-xs text-foreground/80">Valid — no issues found</span>
      </div>
    )
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <span className={cn("size-2 rounded-full", valid ? "bg-warning" : "bg-destructive")} />
        <span className="text-xs text-foreground/80">
          {messages.length} message{messages.length !== 1 ? "s" : ""}
        </span>
      </div>
      <ul className="space-y-1">
        {messages.map((msg, i) => (
          <Root key={i} severity={msg.severity} message={msg.message} location={msg.location}>
            <li className="flex items-start gap-2 rounded bg-muted/50 px-2 py-1.5">
              <SeverityBadge className="mt-0.5" />
              <Message className="text-xs" />
              <Location onNavigateLine={onNavigateLine} />
            </li>
          </Root>
        ))}
      </ul>
    </div>
  )
}

function Summary({ messages, className }: { messages: Array<ValidationMsg> | undefined; className?: string }) {
  if (!messages || messages.length === 0) {
    return (
      <div className={cn("flex items-center gap-1.5 text-[11px]", className)}>
        <span className="size-1.5 rounded-full bg-success" />
        <span className="text-foreground/70">Valid — no issues</span>
      </div>
    )
  }

  return (
    <div className={cn("space-y-1", className)}>
      {messages.map((msg, i) => (
        <Root key={i} severity={msg.severity} message={msg.message} location={msg.location}>
          <div className="flex items-start gap-1.5 text-[10px]">
            <SeverityBadge className="mt-0.5 font-mono" />
            <Message className="text-foreground/70" />
          </div>
        </Root>
      ))}
    </div>
  )
}

export const ValidationMessage = { Root, SeverityBadge, SeverityDot, Message, Location, List, Summary }
export type { ValidationMsg }
