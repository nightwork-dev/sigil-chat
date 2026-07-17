"use client"

// An ArgumentDefinition is rendered in two different compositions inside
// cli-argument-builder.tsx — a full editable form field (Form Mode) and a
// compact type/required chip (Command Mode's help panel) — so it gets the
// Root/Parts compound treatment per this repo's convention, instead of one
// function branching on which view it's in.

import { createContext, useContext } from "react"
import { motion } from "motion/react"
import { cn } from "@workspace/ui/lib/utils"
import { Input } from "@workspace/ui/components/input"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Textarea } from "@workspace/ui/components/textarea"
import { FieldLabel } from "@workspace/ui/components/field"
import { Badge } from "@workspace/ui/components/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { AlertCircleIcon, HashIcon, TypeIcon, ToggleLeftIcon, CalendarIcon, FileTextIcon, ListIcon, BracesIcon, HelpCircleIcon } from "lucide-react"
import type { ArgumentDefinition } from "@workspace/ui/lib/cli-argument"

export const ARGUMENT_TYPE_ICONS = {
  string: TypeIcon,
  number: HashIcon,
  boolean: ToggleLeftIcon,
  date: CalendarIcon,
  file: FileTextIcon,
  array: ListIcon,
  object: BracesIcon,
} as const

interface ArgumentFieldContextValue {
  def: ArgumentDefinition
  value: unknown
  error?: string
  onChange: (value: unknown) => void
}

const ArgumentFieldContext = createContext<ArgumentFieldContextValue | null>(null)

function useArgumentField() {
  const ctx = useContext(ArgumentFieldContext)
  if (!ctx) throw new Error("Argument parts must be used within <Argument.Root>")
  return ctx
}

interface RootProps {
  def: ArgumentDefinition
  value?: unknown
  error?: string
  onChange?: (value: unknown) => void
  children: React.ReactNode
  className?: string
}

function Root({ def, value, error, onChange = () => {}, children, className }: RootProps) {
  return (
    <ArgumentFieldContext.Provider value={{ def, value, error, onChange }}>
      <div data-slot="argument-field" className={className}>
        {children}
      </div>
    </ArgumentFieldContext.Provider>
  )
}

function Label({ className }: { className?: string }) {
  const { def } = useArgumentField()
  const Icon = ARGUMENT_TYPE_ICONS[def.type]
  return (
    <FieldLabel htmlFor={def.name} className={cn("flex items-center gap-1.5", className)}>
      <Icon className="size-3.5 text-muted-foreground" />
      {def.name}
      {def.required && <span className="text-destructive">*</span>}
      {def.description && (
        <Tooltip>
          <TooltipTrigger>
            <HelpCircleIcon className="size-3 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent>
            <p className="max-w-xs">{def.description}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </FieldLabel>
  )
}

function Control({ className }: { className?: string }) {
  const { def, value, error, onChange } = useArgumentField()
  const currentValue = value ?? ""

  if (def.type === "boolean") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Checkbox id={def.name} checked={!!currentValue} onCheckedChange={onChange} />
        <label htmlFor={def.name} className="text-xs text-muted-foreground">
          {def.placeholder || "Enable this option"}
        </label>
      </div>
    )
  }

  if (def.options) {
    return (
      <Select value={currentValue as string} onValueChange={onChange}>
        <SelectTrigger className={cn(error && "border-destructive", className)}>
          <SelectValue placeholder={def.placeholder || `Select ${def.name}`} />
        </SelectTrigger>
        <SelectContent>
          {def.options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (def.type === "array" || def.type === "object") {
    return (
      <Textarea
        id={def.name}
        value={typeof currentValue === "string" ? currentValue : JSON.stringify(currentValue, null, 2)}
        onChange={(e) => {
          try {
            const parsed = def.type === "array" ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean) : JSON.parse(e.target.value || "{}")
            onChange(parsed)
          } catch {
            onChange(e.target.value)
          }
        }}
        placeholder={def.placeholder || (def.type === "array" ? "item1, item2, item3" : "{}")}
        className={cn("min-h-20", error && "border-destructive", className)}
      />
    )
  }

  return (
    <Input
      id={def.name}
      type={def.type === "number" ? "number" : def.type === "date" ? "datetime-local" : "text"}
      value={currentValue as string}
      onChange={(e) => onChange(e.target.value)}
      placeholder={def.placeholder}
      className={cn(error && "border-destructive", className)}
    />
  )
}

function ErrorMessage({ className }: { className?: string }) {
  const { error } = useArgumentField()
  if (!error) return null
  return (
    <motion.p className={cn("flex items-center gap-1 text-xs text-destructive", className)} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <AlertCircleIcon className="size-3" />
      {error}
    </motion.p>
  )
}

/** Compact type/required chip — the Command Mode help panel's composition of the same entity. */
function TypeBadge({ className }: { className?: string }) {
  const { def } = useArgumentField()
  const Icon = ARGUMENT_TYPE_ICONS[def.type]
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Icon className="size-3" />
      <code className="text-[10px]">--{def.name}</code>
      <Badge variant="outline" className="text-[9px]">
        {def.type}
      </Badge>
      {def.required && (
        <Badge variant="destructive" className="text-[9px]">
          required
        </Badge>
      )}
    </div>
  )
}

export const Argument = { Root, Label, Control, Error: ErrorMessage, TypeBadge }
