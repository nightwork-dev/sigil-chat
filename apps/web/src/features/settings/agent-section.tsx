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
  useToolApprovalMode,
  type ToolApprovalMode,
} from "@/lib/agent-tool-approval"
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
  const registryDefault = useUserSetting(userId, "agent.toolApprovalDefault")
  const setRegistryDefault = useSetUserSetting(userId, "agent.toolApprovalDefault")

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

  return (
    <div className="flex max-w-xl flex-col gap-6 p-4">
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
    </div>
  )
}
