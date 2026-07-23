import type {
  AgentCatalog,
  AgentRuntimeToolCatalogItem,
  AgentToolCatalogItem,
} from "./agent-catalog"
import type {
  ToolApprovalMode,
  ToolApprovalOverrides,
} from "./agent-tool-approval"

export type CapabilitySource = "Application tool" | "Agent runtime"

export interface CapabilityItem {
  id: string
  name: string
  description: string
  source: CapabilitySource
  scope: string
  availability: "Available" | "Discoverable"
  consent: string
}

export interface CapabilityGroup {
  id: string
  title: string
  description: string
  items: CapabilityItem[]
}

interface GroupDefinition {
  id: string
  title: string
  description: string
}

const GROUPS: Record<string, GroupDefinition> = {
  "agent-memory": {
    id: "agent-memory",
    title: "Memory",
    description:
      "Recall and curate durable context within the authenticated relationship.",
  },
  "app-guidance": {
    id: "app-guidance",
    title: "App guidance",
    description: "Inspect the live app and point to the right visible place.",
  },
  "connected-tools": {
    id: "connected-tools",
    title: "Connected application tools",
    description:
      "Find the application capability that fits the current request.",
  },
  conversation: {
    id: "conversation",
    title: "Conversation",
    description: "Ask for missing information and keep the work moving.",
  },
  delegation: {
    id: "delegation",
    title: "Delegation",
    description: "Hand bounded work to a specialist when a second mind helps.",
  },
  "files-evidence": {
    id: "files-evidence",
    title: "Files & evidence",
    description:
      "Read scoped files, ground answers in sources, and preserve distills.",
  },
  graph: {
    id: "graph",
    title: "Graphs",
    description: "Inspect, build, run, and revise the shared reducer graph.",
  },
  images: {
    id: "images",
    title: "Images",
    description: "Generate and revise image artifacts for the active work.",
  },
  planning: {
    id: "planning",
    title: "Plans & checklists",
    description: "Track a bounded plan while work is in progress.",
  },
  review: {
    id: "review",
    title: "Review & editing",
    description: "Inspect passages, leave annotations, and make guarded edits.",
  },
  roadmap: {
    id: "roadmap",
    title: "Roadmap work",
    description: "Read and update the shared work board.",
  },
  skills: {
    id: "skills",
    title: "Skills",
    description: "Load procedures and manage reusable instructions by scope.",
  },
  "workspace-shell": {
    id: "workspace-shell",
    title: "Workspace files & shell",
    description:
      "Inspect and change files inside the agent's managed workspace.",
  },
  other: {
    id: "other",
    title: "Other available tools",
    description:
      "Live capabilities that do not yet have a more specific product grouping.",
  },
}

const MEMORY_RUNTIME_TOOLS = new Set([
  "recall_read",
  "remember",
  "correct-memory",
  "forget-memory",
])

function groupForApplicationTool(name: string): string {
  if (name.startsWith("sigil-graph-") || name === "sigil-reducer-catalog")
    return "graph"
  if (name.startsWith("sigil-review-")) return "review"
  if (name.startsWith("sigil-story-")) return "roadmap"
  if (name.startsWith("sigil-skill-")) return "skills"
  if (name.startsWith("sigil-blackboard-")) return "planning"
  if (name === "sigil-generate-image" || name === "sigil-edit-image")
    return "images"
  if (
    name === "sigil-list-session-files" ||
    name === "sigil-read-file" ||
    name === "sigil-evidence-ask" ||
    name === "sigil-distill" ||
    name === "sigil-load-demo-doc"
  ) {
    return "files-evidence"
  }
  if (name === "sigil-ui-highlight" || name === "sigil-chat-status")
    return "app-guidance"
  return "other"
}

function scopeForApplicationTool(name: string): string {
  if (name.startsWith("sigil-graph-") || name === "sigil-reducer-catalog")
    return "Shared graph"
  if (name.startsWith("sigil-review-")) return "Review document"
  if (name.startsWith("sigil-story-")) return "Shared roadmap"
  if (name.startsWith("sigil-skill-")) return "Global to session"
  if (name.startsWith("sigil-blackboard-")) return "Current session"
  if (name === "sigil-generate-image" || name === "sigil-edit-image")
    return "Active resource scope"
  if (name === "sigil-list-session-files" || name === "sigil-read-file")
    return "Session, project, or persona"
  if (
    name === "sigil-evidence-ask" ||
    name === "sigil-distill" ||
    name === "sigil-load-demo-doc"
  ) {
    return "Active resource scope"
  }
  if (name === "sigil-ui-highlight") return "Visible application"
  if (name === "sigil-chat-status") return "Current Sigil instance"
  return "Application"
}

function groupForRuntimeTool(name: string): string {
  if (MEMORY_RUNTIME_TOOLS.has(name)) return "agent-memory"
  if (name === "agent") return "delegation"
  if (name === "ask_question") return "conversation"
  if (name === "todo") return "planning"
  if (name === "load_skill") return "skills"
  if (name === "connection_search") return "connected-tools"
  if (name === "web_search" || name === "web_fetch") return "files-evidence"
  if (["bash", "glob", "grep", "read_file", "write_file"].includes(name))
    return "workspace-shell"
  return "other"
}

function scopeForRuntimeTool(name: string): string {
  if (MEMORY_RUNTIME_TOOLS.has(name)) return "Authorized memory scope"
  if (name === "agent") return "Delegated task"
  if (name === "ask_question" || name === "todo") return "Current session"
  if (name === "load_skill") return "Current agent runtime"
  if (name === "connection_search") return "Connected application"
  if (name === "web_search" || name === "web_fetch") return "Current turn"
  if (["bash", "glob", "grep", "read_file", "write_file"].includes(name))
    return "Managed agent workspace"
  return "Current agent runtime"
}

function humanize(name: string): string {
  return name
    .replace(/^sigil-/, "")
    .replaceAll(/[-_]/g, " ")
    .replaceAll(/\b\w/g, (letter) => letter.toUpperCase())
}

function consentForApplicationTool(
  tool: AgentToolCatalogItem,
  defaultMode: ToolApprovalMode,
  overrides: ToolApprovalOverrides,
): string {
  const mode = overrides[tool.id] ?? defaultMode
  return mode === "always" ? "Runs without a prompt" : "Asks before running"
}

function runtimeItem(tool: AgentRuntimeToolCatalogItem): CapabilityItem {
  return {
    id: tool.id,
    name: humanize(tool.name),
    description: tool.description,
    source: "Agent runtime",
    scope: scopeForRuntimeTool(tool.name),
    availability:
      tool.runtimeStatus === "discoverable" ? "Discoverable" : "Available",
    consent: tool.requiresApproval ? "Requires approval" : "Managed by runtime",
  }
}

function applicationToolItem(
  tool: AgentToolCatalogItem,
  defaultMode: ToolApprovalMode,
  overrides: ToolApprovalOverrides,
): CapabilityItem {
  return {
    id: tool.id,
    name: humanize(tool.name),
    description: tool.description,
    source: "Application tool",
    scope: scopeForApplicationTool(tool.name),
    availability: "Discoverable",
    consent: consentForApplicationTool(tool, defaultMode, overrides),
  }
}

/**
 * Product-only presentation selector. It projects the authenticated runtime
 * and application-tool catalogs; it never declares tools of its own.
 */
export function projectCapabilityGroups(
  catalog: AgentCatalog,
  defaultMode: ToolApprovalMode,
  overrides: ToolApprovalOverrides,
): CapabilityGroup[] {
  const grouped = new Map<string, CapabilityItem[]>()
  const append = (groupId: string, item: CapabilityItem) => {
    const existing = grouped.get(groupId)
    if (existing) existing.push(item)
    else grouped.set(groupId, [item])
  }

  const memoryTools = catalog.runtimeTools.filter((tool) =>
    MEMORY_RUNTIME_TOOLS.has(tool.name),
  )
  if (memoryTools.length > 0) {
    append("agent-memory", {
      id: "runtime__durable-memory",
      name: "Durable Memory",
      description:
        "Recall relevant context and manage accepted memories without crossing the authenticated relationship boundary.",
      source: "Agent runtime",
      scope: "Authorized memory scope",
      availability: memoryTools.some(
        (tool) => tool.runtimeStatus === "discoverable",
      )
        ? "Discoverable"
        : "Available",
      consent: memoryTools.some((tool) => tool.requiresApproval)
        ? "Requires approval"
        : "Managed by runtime",
    })
  }

  for (const tool of catalog.runtimeTools) {
    if (MEMORY_RUNTIME_TOOLS.has(tool.name)) continue
    append(groupForRuntimeTool(tool.name), runtimeItem(tool))
  }
  for (const tool of catalog.tools) {
    append(
      groupForApplicationTool(tool.name),
      applicationToolItem(tool, defaultMode, overrides),
    )
  }
  for (const skill of catalog.skills) {
    append("skills", {
      id: `skill__${skill.id}`,
      name: skill.name,
      description: skill.description,
      source: "Agent runtime",
      scope: "Current agent runtime",
      availability: "Available",
      consent: "Managed by runtime",
    })
  }
  for (const subagent of catalog.subagents) {
    append("delegation", {
      id: `subagent__${subagent.id}`,
      name: subagent.name,
      description: subagent.description,
      source: "Agent runtime",
      scope: "Delegated task",
      availability: "Available",
      consent: "Managed by runtime",
    })
  }

  return [...grouped.entries()]
    .map(([id, items]) => ({
      ...GROUPS[id]!,
      items: items.sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .sort((left, right) => left.title.localeCompare(right.title))
}

export function filterCapabilityGroups(
  groups: readonly CapabilityGroup[],
  query: string,
): CapabilityGroup[] {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return [...groups]
  return groups.flatMap((group) => {
    const groupMatches = `${group.title} ${group.description}`
      .toLocaleLowerCase()
      .includes(normalized)
    const items = groupMatches
      ? group.items
      : group.items.filter((item) =>
          `${item.name} ${item.description} ${item.source} ${item.scope}`
            .toLocaleLowerCase()
            .includes(normalized),
        )
    return items.length > 0 ? [{ ...group, items }] : []
  })
}
