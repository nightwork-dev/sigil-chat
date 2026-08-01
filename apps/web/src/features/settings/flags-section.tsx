// Settings → Flags: installation-scoped feature flag toggles (FLAG.1
// criterion 3).
//
// The second consumer of the installation-settings tier alongside Models
// (see ../../lib/model-enablement.ts / models-section.tsx) — same store,
// same owner-gated write path, same any-principal read path. Plain on/off
// statements: a flag row is an id, a description, and a switch, mirroring
// the tool-permission rows in agent-section.tsx rather than the
// provider/model hierarchy in models-section.tsx, because a flag has no
// grouping structure to reflect.

import { FieldDescription, FieldError } from "@workspace/ui/components/field"
import { Label } from "@workspace/ui/components/label"
import { SectionHeader } from "@workspace/ui/components/section-header"
import { Switch } from "@workspace/ui/components/switch"

import { useFeatureFlags, useSetFeatureFlag } from "@/lib/feature-flags"
import {
  SettingsAsyncState,
  SettingsPanel,
  SettingsSection,
} from "@/features/settings/settings-panel"

export function FlagsSection() {
  const flags = useFeatureFlags()
  const setFlag = useSetFeatureFlag()
  const declared = flags.data?.flags ?? []

  return (
    <SettingsPanel>
      <SettingsSection>
        <SectionHeader>Flags</SectionHeader>

        <SettingsAsyncState
          query={flags}
          pending="Loading flags…"
          error="Declared flags are unavailable until the agent runtime answers."
          isEmpty={declared.length === 0}
          empty="No flags are declared yet."
        >
          <div className="divide-y divide-border">
            {declared.map((flag) => (
              <div
                key={flag.id}
                className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Label
                    htmlFor={`flag-${flag.id}`}
                    className="font-mono text-xs text-foreground"
                  >
                    {flag.id}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {flag.description}
                  </p>
                </div>
                <Switch
                  id={`flag-${flag.id}`}
                  size="sm"
                  className="mt-0.5 shrink-0"
                  aria-label={`Turn ${flag.id} ${flag.enabled ? "off" : "on"}`}
                  checked={flag.enabled}
                  disabled={setFlag.isPending}
                  onCheckedChange={(next) =>
                    setFlag.mutate({ id: flag.id, enabled: next })
                  }
                />
              </div>
            ))}
          </div>
        </SettingsAsyncState>

        {setFlag.isError ? (
          <FieldError>
            {setFlag.error instanceof Error
              ? setFlag.error.message
              : "That change was refused."}
          </FieldError>
        ) : null}

        <FieldDescription>
          Flags are declared in{" "}
          <code className="font-mono">lib/feature-flags/registry.ts</code> and
          take effect for every principal immediately — no deploy required. A
          flag id nobody declared always evaluates default-off.
        </FieldDescription>
      </SettingsSection>
    </SettingsPanel>
  )
}
