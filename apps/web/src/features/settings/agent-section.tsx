// Settings → Agent: default tool-consent preference. Consent UI ONLY — never
// an authorization grant (spec). Reflects + persists the existing
// useToolApprovalMode client store into the registry-backed
// agent.toolApprovalDefault so it survives across devices for this account,
// while the existing localStorage store keeps working as the fast local
// mirror the agent chat reads synchronously.

import { useEffect } from "react"

import { Label } from "@workspace/ui/components/label"
import { RadioGroup, RadioGroupItem } from "@workspace/ui/components/radio-group"
import { SectionHeader } from "@workspace/ui/components/section-header"

import {
  setToolApprovalMode,
  setToolApprovalOverrides,
  useToolApprovalMode,
  useToolApprovalOverrides,
  type ToolApprovalMode,
} from "@/lib/agent-tool-approval"
import { useAgentCatalog } from "@/lib/agent-catalog"
import { useSetUserSetting, useUserSetting } from "@/lib/user-settings"

const OPTIONS: { value: ToolApprovalMode; label: string; description: string }[] = [
  {
    value: "ask",
    label: "Ask every time",
    description: "Eve asks for approval before running a tool.",
  },
  {
    value: "always",
    label: "Always allow",
    description: "Eve runs tools without asking. A convenience preference, not a security boundary.",
  },
]

export function AgentSection({ userId }: { userId: string }) {
  const localMode = useToolApprovalMode()
  const localOverrides = useToolApprovalOverrides()
  const registryDefault = useUserSetting(userId, "agent.toolApprovalDefault")
  const setRegistryDefault = useSetUserSetting(userId, "agent.toolApprovalDefault")
  const registryOverrides = useUserSetting(userId, "agent.toolApprovalOverrides")
  const setRegistryOverrides = useSetUserSetting(
    userId,
    "agent.toolApprovalOverrides",
  )
  const catalog = useAgentCatalog()

  // One-time sync on load: if the registry already has a value for this
  // account and the local client store hasn't been set yet this session,
  // adopt it so a returning user on a fresh browser sees their preference.
  useEffect(() => {
    if (registryDefault.data && registryDefault.data.source !== "default") {
      setToolApprovalMode(registryDefault.data.value)
    }
    // Only ever want this on the initial resolved fetch, not every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registryDefault.data?.source])

  useEffect(() => {
    if (registryOverrides.data && registryOverrides.data.source !== "default") {
      setToolApprovalOverrides(registryOverrides.data.value)
    }
    // Only adopt the durable value once per resolved account fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registryOverrides.data?.source])

  function handleChange(next: ToolApprovalMode) {
    setToolApprovalMode(next)
    setRegistryDefault.mutate({
      scopeKind: "user",
      scopeId: "",
      value: next,
      expectedRevision:
        registryDefault.data?.revision === null ? undefined : registryDefault.data?.revision,
    })
  }

  function handleToolChange(toolId: string, next: "default" | ToolApprovalMode) {
    const updated = { ...localOverrides }
    if (next === "default") delete updated[toolId]
    else updated[toolId] = next
    setToolApprovalOverrides(updated)
    setRegistryOverrides.mutate({
      scopeKind: "user",
      scopeId: "",
      value: updated,
    })
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6 p-4">
      <section className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <SectionHeader>Default tool consent</SectionHeader>
        <RadioGroup
          value={localMode}
          onValueChange={(value) => handleChange(value as ToolApprovalMode)}
          className="flex flex-col gap-3"
        >
          {OPTIONS.map((option) => (
            <div key={option.value} className="flex items-start gap-2.5">
              <RadioGroupItem value={option.value} id={`tool-approval-${option.value}`} />
              <Label
                htmlFor={`tool-approval-${option.value}`}
                className="flex flex-col items-start gap-0.5 font-normal"
              >
                <span className="text-xs font-medium text-foreground">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <div className="flex flex-col gap-1">
          <SectionHeader>Tool permissions</SectionHeader>
          <p className="text-xs text-muted-foreground">
            Per-tool consent defaults are convenience preferences. Gonk still
            enforces authorization and always denies exec-tier tools.
          </p>
        </div>

        {catalog.isPending ? (
          <p className="text-xs text-muted-foreground">Loading tools…</p>
        ) : catalog.isError ? (
          <p className="text-xs text-destructive">
            The authenticated tool catalog is unavailable.
          </p>
        ) : catalog.data.tools.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tools are available.</p>
        ) : (
          <div className="divide-y divide-border">
            {catalog.data.tools.map((tool) => (
              <div
                key={tool.id}
                className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 pr-3">
                  <p className="truncate text-xs font-medium text-foreground">
                    {tool.name}
                  </p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {tool.description}
                  </p>
                </div>
                <RadioGroup
                  aria-label={`${tool.name} approval default`}
                  value={localOverrides[tool.id] ?? "default"}
                  onValueChange={(value) =>
                    handleToolChange(
                      tool.id,
                      value as "default" | ToolApprovalMode,
                    )
                  }
                  className="flex shrink-0 gap-3"
                >
                  {(["default", "ask", "always"] as const).map((mode) => (
                    <Label
                      key={mode}
                      className="flex items-center gap-1.5 text-xs font-normal"
                    >
                      <RadioGroupItem value={mode} />
                      {mode === "default" ? "Default" : mode === "ask" ? "Ask" : "Allow"}
                    </Label>
                  ))}
                </RadioGroup>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
