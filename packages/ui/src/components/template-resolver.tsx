"use client"

// A template (source string + variable map) renders in two real
// compositions — a full authoring view (editable source, per-variable
// value inputs, live resolved preview) and a read-only resolved-output
// display (e.g. showing what prompt was actually sent, in a log or
// history view, with no editing chrome at all) — so it gets the
// Root/Parts compound treatment. Fully controlled: Root takes
// `template`/`vars` + `onTemplateChange`/`onVarsChange` from the parent,
// matching this package's convention for stateful editors (VectorEditor,
// BezierEditorProvider) rather than owning canonical state internally.

import { createContext, useContext, useId, useMemo } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { Textarea } from "@workspace/ui/components/textarea"
import { Input } from "@workspace/ui/components/input"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Badge } from "@workspace/ui/components/badge"
import { AlertTriangleIcon } from "lucide-react"
import { resolveTemplate, type ResolveTemplateResult } from "@workspace/ui/lib/template"

interface TemplateResolverContextValue {
  template: string
  vars: Record<string, string>
  resolved: ResolveTemplateResult
  onTemplateChange: (template: string) => void
  onVarsChange: (vars: Record<string, string>) => void
}

const TemplateResolverContext = createContext<TemplateResolverContextValue | null>(null)

function useTemplateResolver() {
  const ctx = useContext(TemplateResolverContext)
  if (!ctx) throw new Error("TemplateResolver parts must be used within <TemplateResolver.Root>")
  return ctx
}

interface RootProps {
  template: string
  vars: Record<string, string>
  onTemplateChange?: (template: string) => void
  onVarsChange?: (vars: Record<string, string>) => void
  maxDepth?: number
  children: React.ReactNode
  className?: string
}

function Root({ template, vars, onTemplateChange = () => {}, onVarsChange = () => {}, maxDepth, children, className }: RootProps) {
  const resolved = useMemo(() => resolveTemplate(template, vars, maxDepth), [template, vars, maxDepth])
  return (
    <TemplateResolverContext.Provider value={{ template, vars, resolved, onTemplateChange, onVarsChange }}>
      <div data-slot="template-resolver" className={cn("space-y-3", className)}>
        {children}
      </div>
    </TemplateResolverContext.Provider>
  )
}

/** The editable source — the authoring view's composition. */
function Editor({ className, label = "Template" }: { className?: string; label?: string }) {
  const { template, onTemplateChange } = useTemplateResolver()
  const id = useId()
  return (
    <div className="space-y-1">
      <FieldLabel htmlFor={id} className="sr-only">
        {label}
      </FieldLabel>
      <Textarea
        id={id}
        value={template}
        onChange={(e) => onTemplateChange(e.target.value)}
        rows={4}
        placeholder="Use {variable} — a variable's own value can reference further {variables}, resolved recursively."
        className={cn("font-mono text-xs", className)}
      />
    </div>
  )
}

/** One input per variable the template (transitively) depends on — the authoring view's composition. */
function VariableList({ className }: { className?: string }) {
  const { vars, resolved, onVarsChange } = useTemplateResolver()
  // Instance-scoped prefix — a raw `template-var-${key}` id would collide
  // (invalid duplicate DOM ids) if two TemplateResolvers with overlapping
  // variable names render on the same page.
  const uid = useId()

  if (resolved.usedVariables.length === 0) {
    return <p className={cn("text-xs text-muted-foreground", className)}>No {"{variables}"} referenced yet.</p>
  }

  return (
    <div className={cn("space-y-2", className)}>
      {resolved.usedVariables.map((key) => {
        const inputId = `template-var-${uid}-${key}`
        return (
          <Field key={key} orientation="horizontal" className="gap-2">
            <FieldLabel className="w-32 shrink-0 truncate font-mono text-[11px]" htmlFor={inputId}>
              {key}
            </FieldLabel>
            <Input
              id={inputId}
              // Object.hasOwn, not `vars[key] ?? ""` — plain bracket access
              // also walks the prototype chain, so a variable literally
              // named `toString` or `constructor` would read back the
              // inherited Object.prototype method (a function, not a
              // string) instead of the empty string an undefined variable
              // should show.
              value={Object.hasOwn(vars, key) ? vars[key] : ""}
              onChange={(e) => onVarsChange({ ...vars, [key]: e.target.value })}
              placeholder={resolved.unresolvedVariables.includes(key) ? "undefined" : undefined}
              className="h-7 flex-1 font-mono text-xs"
            />
          </Field>
        )
      })}
    </div>
  )
}

/** The read-only resolved output — usable standalone (e.g. a history/log view) without the editing chrome above. */
function Preview({ className }: { className?: string }) {
  const { resolved } = useTemplateResolver()
  const parts = resolved.result.split(/(\{[a-zA-Z_][\w.]*\})/g)

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="rounded-md border border-border bg-muted/30 p-2.5 font-mono text-xs whitespace-pre-wrap">
        {parts.map((part, i) =>
          /^\{[a-zA-Z_][\w.]*\}$/.test(part) ? (
            <span key={i} className="font-medium text-destructive">
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </div>
      {resolved.truncated && (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangleIcon className="size-2.5" />
          Circular reference — resolution stopped early
        </Badge>
      )}
    </div>
  )
}

export const TemplateResolver = { Root, Editor, VariableList, Preview }
