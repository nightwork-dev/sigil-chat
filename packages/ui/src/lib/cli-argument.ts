// Pure types + logic for cli-argument-builder.tsx and argument-field.tsx —
// split out so those two component files can share the ArgumentDefinition
// type without importing from each other.

export interface ArgumentDefinition {
  name: string
  type: "string" | "number" | "boolean" | "date" | "file" | "array" | "object"
  required?: boolean
  description?: string
  defaultValue?: unknown
  options?: string[]
  validation?: (value: unknown) => boolean | string
  placeholder?: string
}

export interface ParsedArgument {
  name: string
  value: unknown
  type: string
  valid: boolean
  error?: string
}

/** Backslash-escapes `"` and `\` and wraps in quotes, so generateCommand's output round-trips through parseCommandLine even when a value contains a literal quote. */
function quoteValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

/** Strips a token's surrounding quotes (if present) and reverses quoteValue's escaping. */
function unquoteValue(token: string): string {
  const stripped = token.startsWith('"') && token.endsWith('"') ? token.slice(1, -1) : token
  return stripped.replace(/\\"/g, '"').replace(/\\\\/g, "\\")
}

export function parseCommandLine(input: string, definitions: ArgumentDefinition[]): ParsedArgument[] {
  const args: ParsedArgument[] = []
  // Quoted segments may contain an escaped quote (\") or backslash (\\) —
  // matched non-greedily via `(?:[^"\\]|\\.)*` instead of `[^"]*`, which
  // would stop at the first escaped quote and mis-tokenize the rest.
  const tokens = input.match(/(?:[^\s"]+|"(?:[^"\\]|\\.)*")+/g) ?? []

  let i = 0
  while (i < tokens.length) {
    const token = tokens[i]

    if (token.startsWith("--")) {
      const argName = token.slice(2)
      const definition = definitions.find((def) => def.name === argName)

      if (!definition) {
        args.push({ name: argName, value: null, type: "unknown", valid: false, error: `Unknown argument: ${argName}` })
        i++
        continue
      }

      let value: unknown
      let valid = true
      let error: string | undefined

      if (definition.type === "boolean") {
        value = true
      } else {
        i++
        if (i >= tokens.length) {
          valid = false
          error = `Missing value for argument: ${argName}`
          value = null
        } else {
          const rawValue = unquoteValue(tokens[i])
          switch (definition.type) {
            case "number": {
              const n = Number(rawValue)
              value = n
              if (Number.isNaN(n)) {
                valid = false
                error = `Invalid number: ${rawValue}`
              }
              break
            }
            case "date": {
              const d = new Date(rawValue)
              value = d
              if (Number.isNaN(d.getTime())) {
                valid = false
                error = `Invalid date: ${rawValue}`
              }
              break
            }
            case "array":
              value = rawValue.split(",").map((s) => s.trim())
              break
            case "object":
              try {
                value = JSON.parse(rawValue)
              } catch {
                valid = false
                error = `Invalid JSON object: ${rawValue}`
              }
              break
            default:
              value = rawValue
          }

          if (valid && definition.validation) {
            const result = definition.validation(value)
            if (result !== true) {
              valid = false
              error = typeof result === "string" ? result : "Validation failed"
            }
          }

          if (valid && definition.options && !definition.options.includes(value as string)) {
            valid = false
            error = `Invalid option. Must be one of: ${definition.options.join(", ")}`
          }
        }
      }

      args.push({ name: argName, value, type: definition.type, valid, error })
    } else {
      args.push({ name: "positional", value: unquoteValue(token), type: "string", valid: true })
    }

    i++
  }

  definitions.forEach((def) => {
    if (def.required && !args.find((arg) => arg.name === def.name)) {
      args.push({ name: def.name, value: null, type: def.type, valid: false, error: `Required argument missing: ${def.name}` })
    }
  })

  return args
}

export function validateFormValues(definitions: ArgumentDefinition[], formValues: Record<string, unknown>): Record<string, string> {
  const newErrors: Record<string, string> = {}

  definitions.forEach((def) => {
    const value = formValues[def.name]

    if (def.required && (value === undefined || value === null || value === "")) {
      newErrors[def.name] = "This field is required"
      return
    }

    if (value !== undefined && value !== null && value !== "") {
      if (def.type === "number" && Number.isNaN(Number(value))) newErrors[def.name] = "Must be a valid number"
      if (def.type === "date" && Number.isNaN(new Date(value as string).getTime())) newErrors[def.name] = "Must be a valid date"

      if (!newErrors[def.name] && def.validation) {
        const result = def.validation(value)
        if (result !== true) newErrors[def.name] = typeof result === "string" ? result : "Validation failed"
      }
      if (!newErrors[def.name] && def.options && !def.options.includes(value as string)) {
        newErrors[def.name] = `Must be one of: ${def.options.join(", ")}`
      }
    }
  })

  return newErrors
}

export function generateCommand(definitions: ArgumentDefinition[], formValues: Record<string, unknown>): string {
  const args: string[] = []
  definitions.forEach((def) => {
    const value = formValues[def.name]
    if (value === undefined || value === null || value === "") return

    if (def.type === "boolean" && value) {
      args.push(`--${def.name}`)
    } else if (def.type !== "boolean") {
      let formatted = value
      if (def.type === "array" && Array.isArray(value)) formatted = value.join(",")
      else if (def.type === "object") formatted = JSON.stringify(value)
      else if (def.type === "date") formatted = new Date(value as string).toISOString()
      args.push(`--${def.name} ${quoteValue(String(formatted))}`)
    }
  })
  return args.join(" ")
}
