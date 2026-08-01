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

import { Label } from "@workspace/ui/components/label"
import { SectionHeader } from "@workspace/ui/components/section-header"
import { Switch } from "@workspace/ui/components/switch"

import { useFeatureFlags, useSetFeatureFlag } from "@/lib/feature-flags"

export function FlagsSection() {
  const flags = useFeatureFlags()
  const setFlag = useSetFeatureFlag()

  return (
    <div className="flex max-w-2xl flex-col gap-6 p-4">
      <section className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <SectionHeader>Flags</SectionHeader>

        {flags.isPending ? (
          <p className="text-xs text-muted-foreground">Loading flags…</p>
        ) : flags.isError ? (
          <p className="text-xs text-destructive">
            Declared flags are unavailable until the agent runtime answers.
          </p>
        ) : flags.data.flags.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No flags are declared yet.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {flags.data.flags.map((flag) => (
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
        )}

        {setFlag.isError ? (
          <p className="text-xs text-destructive">
            {setFlag.error instanceof Error
              ? setFlag.error.message
              : "That change was refused."}
          </p>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Flags are declared in{" "}
          <code className="font-mono">lib/feature-flags/registry.ts</code>{" "}
          and take effect for every principal immediately — no deploy
          required. A flag id nobody declared always evaluates default-off.
        </p>
      </section>
    </div>
  )
}
