// Settings → Agent: default tool-consent preference. Consent UI ONLY — never
// an authorization grant (spec). Reflects + persists the existing
// useToolApprovalMode client store into the registry-backed
// agent.toolApprovalDefault so it survives across devices for this account,
// while the existing localStorage store keeps working as the fast local
// mirror the agent chat reads synchronously.

import { useEffect } from "react"

import { CheckIcon, CircleDashedIcon, CircleHelpIcon } from "lucide-react"

import { Label } from "@workspace/ui/components/label"
import { RadioGroup, RadioGroupItem } from "@workspace/ui/components/radio-group"
import { SectionHeader } from "@workspace/ui/components/section-header"
import { Switch } from "@workspace/ui/components/switch"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { setSpeakReplies, useSpeakReplies } from "@/lib/agent-speak-replies"
import {
  setToolApprovalMode,
  setToolApprovalOverrides,
  useToolApprovalMode,
  useToolApprovalOverrides,
  type ToolApprovalMode,
} from "@/lib/agent-tool-approval"
import { useAgentCatalog } from "@/lib/agent-catalog"
import { useSetUserSetting, useUserSetting } from "@/lib/user-settings"

const TOOL_MODES: {
  value: "default" | ToolApprovalMode
  label: string
  hint: string
  icon: typeof CircleDashedIcon
}[] = [
  {
    value: "default",
    label: "Default",
    hint: "follow the default consent above",
    icon: CircleDashedIcon,
  },
  {
    value: "ask",
    label: "Ask",
    hint: "ask before running this tool",
    icon: CircleHelpIcon,
  },
  {
    value: "always",
    label: "Allow",
    hint: "run this tool without asking",
    icon: CheckIcon,
  },
]

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
  const localSpeakReplies = useSpeakReplies()
  const registrySpeakReplies = useUserSetting(userId, "agent.speakReplies")
  const setRegistrySpeakReplies = useSetUserSetting(userId, "agent.speakReplies")
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

  useEffect(() => {
    if (registrySpeakReplies.data && registrySpeakReplies.data.source !== "default") {
      setSpeakReplies(registrySpeakReplies.data.value)
    }
    // Only adopt the durable value once per resolved account fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrySpeakReplies.data?.source])

  function handleSpeakRepliesChange(next: boolean) {
    setSpeakReplies(next)
    setRegistrySpeakReplies.mutate({
      scopeKind: "user",
      scopeId: "",
      value: next,
      expectedRevision: registrySpeakReplies.data?.revision ?? undefined,
    })
  }

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

      {/* One switch, one sentence: the title already says what it does, so
          the supporting line is spent on the two things a user cannot see —
          that it waits for the turn to finish, and that nothing about the
          written transcript changes. */}
      <section className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="speak-replies">Speak replies aloud</Label>
          <p className="text-xs text-muted-foreground">
            Read each of Eve&apos;s replies once the turn finishes. The written
            transcript is unchanged, and tool calls, reasoning, and approvals
            are never spoken.
          </p>
        </div>
        <Switch
          checked={localSpeakReplies}
          disabled={setRegistrySpeakReplies.isPending}
          id="speak-replies"
          onCheckedChange={handleSpeakRepliesChange}
        />
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <div className="flex flex-col gap-1">
          <SectionHeader>Tool permissions</SectionHeader>
          <p className="text-xs text-muted-foreground">
            Per-tool consent defaults are convenience preferences. Server
            policy still enforces authorization and always denies exec-tier tools.
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
          <TooltipProvider delay={200}>
            <div className="divide-y divide-border">
              {catalog.data.tools.map((tool) => (
                <div
                  key={tool.id}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">
                      {tool.name || tool.id}
                    </p>
                    {tool.description ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {tool.description}
                      </p>
                    ) : null}
                  </div>
                  <ToggleGroup
                    value={[localOverrides[tool.id] ?? "default"]}
                    onValueChange={(group) => {
                      // Re-clicking the active segment reports an empty group;
                      // one mode is always in force, so ignore the deselect.
                      const next = group[group.length - 1]
                      if (typeof next !== "string") return
                      handleToolChange(
                        tool.id,
                        next as "default" | ToolApprovalMode,
                      )
                    }}
                    variant="outline"
                    size="sm"
                    spacing={0}
                    className="shrink-0"
                    aria-label={`${tool.name || tool.id} approval default`}
                  >
                    {TOOL_MODES.map(({ value, label, hint, icon: Icon }) => (
                      <Tooltip key={value}>
                        <TooltipTrigger render={<span />}>
                          <ToggleGroupItem
                            value={value}
                            aria-label={`${label} — ${hint}`}
                          >
                            <Icon />
                          </ToggleGroupItem>
                        </TooltipTrigger>
                        <TooltipContent>
                          {label} — {hint}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </ToggleGroup>
                </div>
              ))}
            </div>
          </TooltipProvider>
        )}
      </section>
    </div>
  )
}
