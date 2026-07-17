"use client"

// Rebuilt
// on our own primitives instead of the source's parallel imports;
// migrated framer-motion -> motion/react; swapped hardcoded
// red-500/green-50/green-200 for theme tokens (destructive / primary).
// Removed every useCallback in the source — none were legitimate here
// (no memoized children, nothing depends on their referential
// stability). An ArgumentDefinition renders in two different
// compositions (full form field vs. a compact type/required chip in
// the Command Mode help panel) — split out as the Argument.Root/Label/
// Control/Error/TypeBadge compound in argument-field.tsx rather than
// one function branching on which view it's in. Demo content stripped
// — see the `interaction` showcase category for a themed demo instead.

import { useState, useRef } from "react"
import { motion, AnimatePresence } from "motion/react"
import { cn } from "@workspace/ui/lib/utils"
import { parseCommandLine, validateFormValues, generateCommand, type ArgumentDefinition, type ParsedArgument } from "@workspace/ui/lib/cli-argument"
import { Argument } from "@workspace/ui/components/argument-field"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Field } from "@workspace/ui/components/field"
import { Badge } from "@workspace/ui/components/badge"
import { TerminalIcon, PlayIcon, CopyIcon, CheckIcon, AlertCircleIcon } from "lucide-react"

export type { ArgumentDefinition, ParsedArgument }

interface CliArgumentBuilderProps {
  definitions: ArgumentDefinition[]
  onParse?: (args: ParsedArgument[]) => void
  className?: string
  showHelp?: boolean
}

export function CliArgumentBuilder({ definitions, onParse, className, showHelp = true }: CliArgumentBuilderProps) {
  const [inputValue, setInputValue] = useState("")
  const [parsedArgs, setParsedArgs] = useState<ParsedArgument[]>([])
  const [mode, setMode] = useState<"form" | "command">("form")
  // Lazy initializer, not useEffect — `definitions` is treated as the
  // initial schema (like BezierEditorProvider's initialCurves), not a
  // value this component re-syncs to on every prop change.
  const [formValues, setFormValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {}
    definitions.forEach((def) => {
      if (def.defaultValue !== undefined) initial[def.name] = def.defaultValue
    })
    return initial
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleCommandParse() {
    const parsed = parseCommandLine(inputValue, definitions)
    setParsedArgs(parsed)
    onParse?.(parsed)
  }

  function handleFormSubmit() {
    const newErrors = validateFormValues(definitions, formValues)
    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) return

    const parsed: ParsedArgument[] = definitions.map((def) => ({
      name: def.name,
      value: formValues[def.name] ?? def.defaultValue,
      type: def.type,
      valid: true,
    }))
    setParsedArgs(parsed)
    onParse?.(parsed)
  }

  async function handleCopyCommand() {
    try {
      await navigator.clipboard.writeText(generateCommand(definitions, formValues))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy command:", err)
    }
  }

  return (
    <div data-slot="cli-argument-builder" className={cn("space-y-4", className)}>
      <div className="flex items-center gap-2">
        <Button variant={mode === "form" ? "default" : "outline"} size="sm" onClick={() => setMode("form")}>
          Form Mode
        </Button>
        <Button variant={mode === "command" ? "default" : "outline"} size="sm" onClick={() => setMode("command")}>
          Command Mode
        </Button>
      </div>

      {mode === "form" ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3 rounded-md border border-border p-3">
            <span className="text-sm font-medium">Argument Form</span>
            {definitions.map((def) => (
              <motion.div key={def.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
                <Argument.Root
                  def={def}
                  value={formValues[def.name]}
                  error={errors[def.name]}
                  onChange={(newValue) => {
                    setFormValues((prev) => ({ ...prev, [def.name]: newValue }))
                    if (errors[def.name]) setErrors((prev) => ({ ...prev, [def.name]: "" }))
                  }}
                >
                  <Field>
                    <Argument.Label />
                    <Argument.Control />
                    <Argument.Error />
                  </Field>
                </Argument.Root>
              </motion.div>
            ))}
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={handleFormSubmit} className="flex-1">
                <PlayIcon className="mr-1.5 size-3.5" />
                Parse Arguments
              </Button>
              <Button size="icon-sm" variant="outline" onClick={handleCopyCommand}>
                {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <span className="text-sm font-medium">Generated Command</span>
            <div className="rounded-md bg-muted p-2.5 font-mono text-xs">{generateCommand(definitions, formValues) || "No arguments set"}</div>
          </div>
        </div>
      ) : (
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <TerminalIcon className="size-4" />
            Command Line Parser
          </div>
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="--name John --age 25 --active"
              className="font-mono"
              onKeyDown={(e) => e.key === "Enter" && handleCommandParse()}
            />
            <Button size="icon-sm" onClick={handleCommandParse}>
              <PlayIcon className="size-3.5" />
            </Button>
          </div>

          {showHelp && (
            <div className="rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground">
              <p className="mb-2 font-medium">Available arguments:</p>
              <div className="grid grid-cols-2 gap-1.5">
                {definitions.map((def) => (
                  <Argument.Root key={def.name} def={def}>
                    <Argument.TypeBadge />
                  </Argument.Root>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {parsedArgs.length > 0 && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <span className="text-sm font-medium">Parsed Results</span>
          <AnimatePresence>
            {parsedArgs.map((arg, index) => (
              <motion.div
                key={`${arg.name}-${index}`}
                className={cn(
                  "flex items-center justify-between rounded-md border p-2.5",
                  arg.valid ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"
                )}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.15, delay: index * 0.03 }}
              >
                <div className="flex items-center gap-2">
                  <Badge variant={arg.valid ? "default" : "destructive"} className="text-[10px]">
                    {arg.name}
                  </Badge>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{arg.value !== null ? String(arg.value) : "null"}</code>
                  <Badge variant="outline" className="text-[9px]">
                    {arg.type}
                  </Badge>
                </div>
                {arg.error && (
                  <div className="flex items-center gap-1 text-destructive">
                    <AlertCircleIcon className="size-3.5" />
                    <span className="text-xs">{arg.error}</span>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
