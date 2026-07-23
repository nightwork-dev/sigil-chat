export type ToolApprovalMode = "ask" | "always"

const MAX_TOOL_APPROVAL_OVERRIDES = 64
const MAX_TOOL_NAME_LENGTH = 160

interface ToolApprovalPreference {
  default: ToolApprovalMode
  tools: Readonly<Record<string, ToolApprovalMode>>
}

export function parseToolApprovalPreference(
  value: unknown,
): ToolApprovalPreference {
  if (value === "always") return { default: "always", tools: {} }
  if (typeof value !== "string" || value.length > 16_384) {
    return { default: "ask", tools: {} }
  }
  try {
    const parsed: unknown = JSON.parse(value)
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { default: "ask", tools: {} }
    }
    const candidate = parsed as { default?: unknown; tools?: unknown }
    const tools =
      typeof candidate.tools === "object" &&
      candidate.tools !== null &&
      !Array.isArray(candidate.tools)
        ? Object.fromEntries(
            Object.entries(candidate.tools)
              .slice(0, MAX_TOOL_APPROVAL_OVERRIDES)
              .filter(
                ([toolName, mode]) =>
                  toolName.length > 0 &&
                  toolName.length <= MAX_TOOL_NAME_LENGTH &&
                  (mode === "ask" || mode === "always"),
              ),
          )
        : {}
    return {
      default: candidate.default === "always" ? "always" : "ask",
      tools,
    }
  } catch {
    return { default: "ask", tools: {} }
  }
}

export function toolApprovalModeFor(
  value: unknown,
  toolName: string,
): ToolApprovalMode {
  const preference = parseToolApprovalPreference(value)
  return preference.tools[toolName] ?? preference.default
}
