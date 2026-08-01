// Settings → Agent: default tool-consent preference. Consent UI ONLY — never
// an authorization grant (spec). Reflects + persists the existing
// useToolApprovalMode client store into the registry-backed
// agent.toolApprovalDefault so it survives across devices for this account,
// while the existing localStorage store keeps working as the fast local
// mirror the agent chat reads synchronously.

import { useState } from "react"

import {
  CheckIcon,
  CircleDashedIcon,
  CircleHelpIcon,
  SearchIcon,
} from "lucide-react"

import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"
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
import { useAdoptedAgentPreferences } from "@/lib/agent-preferences"
import {
  ACCOUNT_WIDE_AGENT_KEY,
  effectiveToolApprovalOverrides,
  setToolApprovalMode,
  setToolApprovalOverrides,
  useToolApprovalMode,
  useToolApprovalOverrides,
  type PerAgentToolApprovalOverrides,
  type ToolApprovalMode,
} from "@/lib/agent-tool-approval"
import { useAgentCatalog } from "@/lib/agent-catalog"
import { groupApplicationTools } from "@/lib/capability-model"
import { useSetUserSetting } from "@/lib/user-settings"
import {
  SettingsAsyncState,
  SettingsNote,
  SettingsPanel,
  SettingsSection,
} from "@/features/settings/settings-panel"

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

const OPTIONS: {
  value: ToolApprovalMode
  label: string
  description: string
}[] = [
  {
    value: "ask",
    label: "Ask every time",
    description: "Eve asks for approval before running a tool.",
  },
  {
    value: "always",
    label: "Always allow",
    description:
      "Eve runs tools without asking. A convenience preference, not a security boundary.",
  },
]

export function AgentSection({ userId }: { userId: string }) {
  const localMode = useToolApprovalMode()
  const localOverrides = useToolApprovalOverrides()
  // The durable copies, with the local mirrors this surface edits already
  // adopted — the adopt-once rule belongs to the store, not to this page.
  const {
    toolApprovalDefault: registryDefault,
    speakReplies: registrySpeakReplies,
  } = useAdoptedAgentPreferences(userId)
  const setRegistryDefault = useSetUserSetting(
    userId,
    "agent.toolApprovalDefault",
  )
  const setRegistryOverrides = useSetUserSetting(
    userId,
    "agent.toolApprovalOverrides",
  )
  const localSpeakReplies = useSpeakReplies()
  const setRegistrySpeakReplies = useSetUserSetting(
    userId,
    "agent.speakReplies",
  )
  const catalog = useAgentCatalog()

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
        registryDefault.data?.revision === null
          ? undefined
          : registryDefault.data?.revision,
    })
  }

  // This surface edits the account-wide "*" layer. Per-agent layers arrive
  // with the multi-agent track (MA.4 gates the UI on a second interactive
  // agent existing).
  const accountLayer = effectiveToolApprovalOverrides(localOverrides)

  const [toolQuery, setToolQuery] = useState("")
  const toolGroups = groupApplicationTools(catalog.data?.tools ?? [], toolQuery)

  function handleToolChange(
    toolId: string,
    next: "default" | ToolApprovalMode,
  ) {
    const layer = { ...accountLayer }
    if (next === "default") delete layer[toolId]
    else layer[toolId] = next
    const updated: PerAgentToolApprovalOverrides = {
      ...localOverrides,
      [ACCOUNT_WIDE_AGENT_KEY]: layer,
    }
    if (Object.keys(layer).length === 0) {
      delete updated[ACCOUNT_WIDE_AGENT_KEY]
    }
    setToolApprovalOverrides(updated)
    setRegistryOverrides.mutate({
      scopeKind: "user",
      scopeId: "",
      value: updated,
    })
  }

  return (
    <SettingsPanel>
      <SettingsSection>
        <SectionHeader>Default tool consent</SectionHeader>
        <RadioGroup
          value={localMode}
          onValueChange={(value) => handleChange(value as ToolApprovalMode)}
          className="flex flex-col gap-3"
        >
          {OPTIONS.map((option) => (
            <div key={option.value} className="flex items-start gap-2.5">
              <RadioGroupItem
                value={option.value}
                id={`tool-approval-${option.value}`}
              />
              <Label
                htmlFor={`tool-approval-${option.value}`}
                className="flex flex-col items-start gap-0.5 font-normal"
              >
                <span className="text-xs font-medium text-foreground">
                  {option.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {option.description}
                </span>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </SettingsSection>

      {/* One switch, one sentence: the title already says what it does, so
          the supporting line is spent on the two things a user cannot see —
          that it waits for the turn to finish, and that nothing about the
          written transcript changes. */}
      <SettingsSection layout="row">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="speak-replies">Speak replies aloud</Label>
          <SettingsNote>
            Read each of Eve&apos;s replies once the turn finishes. The written
            transcript is unchanged, and tool calls, reasoning, and approvals
            are never spoken.
          </SettingsNote>
        </div>
        <Switch
          checked={localSpeakReplies}
          disabled={setRegistrySpeakReplies.isPending}
          id="speak-replies"
          onCheckedChange={handleSpeakRepliesChange}
        />
      </SettingsSection>

      <SettingsSection>
        <div className="flex flex-col gap-1">
          <SectionHeader>Tool permissions</SectionHeader>
          <SettingsNote>
            Per-tool consent defaults are convenience preferences. Server policy
            still enforces authorization and always denies exec-tier tools.
          </SettingsNote>
        </div>

        <SettingsAsyncState
          query={catalog}
          pending="Loading tools…"
          error="The authenticated tool catalog is unavailable."
          isEmpty={(catalog.data?.tools.length ?? 0) === 0}
          empty="No tools are available."
        >
          <TooltipProvider delay={200}>
            <div className="relative">
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={toolQuery}
                onChange={(event) => setToolQuery(event.target.value)}
                placeholder={`Search ${catalog.data?.tools.length ?? 0} tools…`}
                aria-label="Search tools"
                className="h-8 pl-8 text-xs"
              />
            </div>
            {toolGroups.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No tools match “{toolQuery.trim()}”.
              </p>
            ) : null}
            {toolGroups.map((group) => (
              <div key={group.title} className="flex flex-col gap-1">
                <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  {group.title}
                </p>
                <div className="divide-y divide-border">
                  {group.tools.map((tool) => (
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
                        value={[accountLayer[tool.id] ?? "default"]}
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
                        {TOOL_MODES.map(
                          ({ value, label, hint, icon: Icon }) => (
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
                          ),
                        )}
                      </ToggleGroup>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </TooltipProvider>
        </SettingsAsyncState>
      </SettingsSection>
    </SettingsPanel>
  )
}
